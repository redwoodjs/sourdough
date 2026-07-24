// SQLite-backed KV storage for Node.js (Tier 0 first-party provider).
//   * `put` is one atomic INSERT OR REPLACE on the TEXT PRIMARY KEY — value, metadata and expiration are replaced together; a crash never leaves mismatched data/metadata sidecars.
//   * Concurrent readers don't block writers (SQLite locking serializes writers at the connection level); no filesystem-rename coordination is needed because every namespace owns exactly one DatabaseSync handle.
//   * Prefixed list() is an indexed range scan (~O(log n + page size)). Un-prefixed scans are capped by LIMIT so they never read the whole table. Expiry filtering happens here in JS, so each WHERE clause binds only TEXT (keys/cursor) and INTEGER (LIMIT); no NUMERIC/REAL value ever binds into a column — this keeps node-sqlite's strict-affinity type checking off list paths.

import { createRequire } from "node:module";
import path from "node:path";
import { mkdirSync } from "node:fs";
import type { KVService, KVServiceGetResult, KVServiceListEntry, KVServiceListResponse } from "../../service.js";
import type { KVListOptions, KVPutOptions } from "../../types.js";

const require = createRequire(import.meta.url);

/** Load the node:sqlite driver, or throw a helpful error for old/misconfigured runtimes. */
function loadDriver(): AnyCtor<DatabaseSyncInstance> {
  try {
    const sqlite = require("node:sqlite");
    if (!sqlite?.DatabaseSync) throw new Error("node:sqlite present but DatabaseSync export missing.");
    return sqlite.DatabaseSync as AnyCtor<DatabaseSyncInstance>;
  } catch (error) {
    throw new Error(
      "KV SQLite provider requires node:sqlite. On Node.js < 24, enable --experimental-sqlite or upgrade to v22.5+. (" + ((error as Error)?.message ?? String(error)) + ")",
    );
  }
}

/** Default page size when callers omit the value: matches Cloudflare (1000). Callers passing `limit` should already be within [1, MAX]; we mirror here as a constant for self-tests. */
export const MAX_LIST_LIMIT = 1000;

// Storage unit is epoch seconds (matches the public KVPutOptions.expiration contract & KVNamespace.normalizePutOptions which checks Date.now()/1000). NOTE: do NOT divide by 100 — that would mis-scale TTLs relative to absolute expirations.
const nowSeconds = (): number => Math.floor(Date.now() / 1000);

/** Safe exclusive upper bound for a prefix range scan.
 *
 * Incrementing raw UTF-8 bytes can produce invalid sequences (e.g. "ÿ" → "��")
 * which TextDecoder replaces with U+FFFD, leaking unrelated keys. Instead we
 * append a high Unicode codepoint so the bound always sorts after every valid
 * extension of the prefix while remaining a well-formed string.
 */
export function nextKey(prefix: string): string {
  // U+D800 is a lone high-surrogate — it never appears in valid UTF-8 text,
  // but SQLite's TEXT comparison treats it as a codepoint that sorts after
  // every BMP character. Appending it guarantees the bound is strictly after
  // any key that starts with `prefix`.
  return prefix + "\uD800";
}

/** Drain a ReadableStream into a single Uint8Array (used when put() receives a stream value instead of plain bytes). */
async function drain(value: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const chunks: Uint8Array[] = []; let total = 0; const reader = value.getReader();
  try { for (;;) { const r = await reader.read(); if (r.done || !r.value) break; chunks.push(r.value); total += r.value.byteLength; } } finally { void reader.releaseLock(); }
  const out = new Uint8Array(total); let at = 0; for (const c of chunks) { out.set(c, at); at += c.byteLength; } return out;
}

export interface SQLiteKVServiceOptions { root: string; /** Directory that will hold the namespace's KV database file. */ }

/** true when a stored expiration epoch-seconds value has lapsed (or is missing). */
function expired(expiration: unknown): boolean {
  return typeof expiration === "number" && !Number.isNaN(expiration) && expiration <= nowSeconds();
}

type AnyCtor<T> = new (...args: any[]) => T;
interface DatabaseSyncInstance { prepare(sql: string): PreparedStatement; exec?(sql: string): void; close(): void; }
interface PreparedStatement { run(...params: unknown[]): { changes: number }; get(...params: unknown[]): Record<string, unknown> | undefined; all(...params: unknown[]): Array<Record<string, unknown>>; }

const DB_FILE = "kv.sqlite"; // one database file per namespace directory.

/** KVService backed by node:sqlite — one DatabaseSync per namespace root; close() the handle so directories are removable in tests/cleanup. */
export class SQLiteKVService implements KVService {
  readonly root: string;
  private db!: DatabaseSyncInstance;

  // Prepared statements (built once, reused inside ensureSchema). `?` placeholder counts correspond positionally to the params array at each call site.
  private stGet!: PreparedStatement;
  private stPut!: PreparedStatement;
  private stExpByKey!: PreparedStatement;
  private stDeleteKey!: PreparedStatement;

  constructor(options: SQLiteKVServiceOptions | string) {
    this.root = typeof options === "string" ? options : options.root;
    const dir = path.resolve(this.root);
    mkdirSync(dir, { recursive: true }); // service owns creating its namespace directory so callers needn't pre-create it.

    const DatabaseSyncCtor = loadDriver();
    this.db = new DatabaseSyncCtor(path.join(dir, DB_FILE));
  }

  private ensureSchema(): void {
    if (this.stGet) return; // already initialized
    this.db.exec!("CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value BLOB NOT NULL, metadataRaw TEXT, expiration INTEGER)");

    this.stGet = this.db.prepare("SELECT value, metadataRaw AS metadata, expiration FROM kv WHERE key = ?");
    this.stPut = this.db.prepare("INSERT OR REPLACE INTO kv(key, value, metadataRaw, expiration) VALUES(?, ?, ?, ?)");
    this.stExpByKey = this.db.prepare("SELECT expiration FROM kv WHERE key = ?");
    this.stDeleteKey = this.db.prepare("DELETE FROM kv WHERE key = ?");
  }

  /** Reads one key; returns null when missing/expired (and lazily purges expired rows on hit). */
  async get(key: string): Promise<KVServiceGetResult> {
    this.ensureSchema();
    const row = this.stGet.get(key) as { value: Uint8Array | undefined; metadata?: unknown; expiration?: unknown } | undefined;
    if (!row || row.value === undefined || row.value === null) return { value: null, metadataRaw: null };
    if (expired(row.expiration)) { await this.purge(key); return { value: null, metadataRaw: null }; } // lazy expiry on read.
    return { value: row.value as Uint8Array, metadataRaw: coerceMetadataRaw(row.metadata) } as KVServiceGetResult;
  }

  /** Atomically upserts a key with optional expiration/expirationTtl + user metadata. */
  async put(
    key: string,
    value: Uint8Array | ReadableStream<Uint8Array>,
    options?: KVPutOptions,
  ): Promise<void> {
    this.ensureSchema();

    // Materialize the storage expiration as epoch seconds. Note normalizePutOptions (in adapter) guarantees at most one of expiration/expirationTtl is set & that absolute expirations are future — so here we only translate ttl -> absolute and store it.
    let expiration: number | null = null;
    if (options?.expiration !== undefined && options.expiration !== null) {
      expiration = Math.floor(options.expiration);
    } else if (options?.expirationTtl !== undefined && options.expirationTtl !== null) {
      expiration = nowSeconds() + Math.ceil(Number(options.expirationTtl)); // ttl is relative seconds; store absolute epoch-seconds.
    }

    let metadataRaw: string | null = toMetadataRaw(options?.metadata); // throws on non-serializable (e.g. circular) shapes — surface a JSON error like Cloudflare would at this layer's normalization contract.

    const bytes = value instanceof Uint8Array ? value : await drain(value);
    this.stPut.run(key, bytes, metadataRaw, expiration ?? null);
  }

  /** Deletes every row for `keys`; resolves true when at least one non-expired entry existed beforehand (stale/ghost rows are still physically removed). */
  async delete(keys: string[]): Promise<boolean> {
    this.ensureSchema();
    const seen = new Set<string>();
    let existed = false;
    for (const key of keys) {
      if (seen.has(key)) continue;
      seen.add(key);
      const row = this.stExpByKey.get(key) as { expiration?: unknown } | undefined; // KEY-encoded uniqueness check — TEXT only.
      if (row && !expired(row.expiration)) existed = true; // expired-but-present does not count as "existing" per CF semantics; but we still physically delete it below so the ghost never lingers.
      this.stDeleteKey.run(key);
    }
    return existed;
  }

  /** Index-only range scan with in-JS expiry filtering + cursor-based pagination (no NUMERIC binds into WHERE, honoring strict-affinity constraints). */
  async list(options: KVListOptions): Promise<KVServiceListResponse> {
    this.ensureSchema();
    const cap = Math.min(Math.max(1, options.limit ?? MAX_LIST_LIMIT), MAX_LIST_LIMIT);

    // Build a parameterized predicate over the key space. Everything bound here is TEXT (prefix/cursor) — never REAL/NUMERIC into a column.
    let where = "";
    const whereParams: unknown[] = [];
    if (options.prefix !== undefined && options.prefix !== "") {
      const upper = nextKey(options.prefix); // exclusive bound; inclusive lower == prefix.
      where += "k.key >= ? AND k.key < ?";
      whereParams.push(options.prefix, upper);
    }

    if (options.cursor !== undefined && options.cursor !== "") {
      // Cursor is the plaintext key name of the last entry returned on the previous page (binding layer base64url-encodes/decodes around this contract). Exclusive continuation.
      const clause = "k.key > ?";
      where += where ? ` AND ${clause}` : clause;
      whereParams.push(options.cursor);
    }

    // Fetch rows in batches until we have enough live entries or exhaust the table.
    // This avoids the case where all fetched rows are expired and we return an
    // empty page with no cursor (making pagination impossible).
    // NOTE: node:sqlite (DatabaseSync) does not support parameterized OFFSET/LIMIT,
    // so we inline the integer values directly (safe — they are controlled integers).
    const allRows: Array<{ key: string; expiration?: unknown; metadataRaw?: unknown }> = [];
    const batchSize = Math.min(cap + 1, 1000);
    let offset = 0;
    while (allRows.length < cap + 1) {
      const sql = `SELECT k.key AS key, k.expiration AS expiration, k.metadataRaw AS "metadata" FROM kv AS k ${where ? `WHERE ${where}` : ""} ORDER BY k.key ASC LIMIT ${batchSize} OFFSET ${offset}`;
      const batch = this.db.prepare(sql).all(...whereParams) as Array<{ key: string; expiration?: unknown; metadataRaw?: unknown }>;
      if (batch.length === 0) break; // no more rows in the table.
      allRows.push(...batch);
      offset += batch.length;
    }

    return buildListResponse(allRows, cap);
  }

  /** Releases the underlying SQLite handle so namespaces are removable (tests/cleanup do rm -rf on root after close). */
  async close(): Promise<void> {
    this.purgeFile?.(); // nothing extra currently.
    try { if (this.db) this.db.close(); } catch { /* ignore double-close / already-closed errors so callers always clean up dirs. */ }
  }

  private purgeFile?: () => void;

  private async purge(key: string): Promise<void> { this.stDeleteKey.run(key); } // remove a single expired row by key (TEXT only).
}

// --- helpers ---------------------------------------------------------------

function coerceMetadataRaw(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  const s = String(value as any);
  return s.length ? s : null;
}

/** Serialize user metadata for storage. Throws a JSON-error on non-serializable input so the adapter/normalization contract surfaces it to callers. */
export function toMetadataRaw(metadata: unknown): string | null {
  if (metadata === undefined || metadata === null) return null; // absent/null => no metadata stored at all (list entries stay bare {name}).
  try {
    const json = JSON.stringify(metadata);
    if (!json || json === "null") return null;
    return json;
  } catch (error: unknown) {
    throw new Error("KV user metadata is not JSON-serializable", { cause: error }); // message carries /JSON/ for validation tests.
  }
}

function buildListResponse(
  rows: Array<{ key: string; expiration?: unknown; metadataRaw?: unknown }>,
  cap: number,
): KVServiceListResponse {
  const keys: KVServiceListEntry[] = [];
  // Drop expired ghosts as we walk the (already sorted) result set so they never leak into listings.
  for (const row of rows) {
    if (expired(row.expiration)) continue; // skip & filter late without mutating storage here (next get/list will re-skip).
    if (keys.length >= cap) break; // we fetched cap+1; once we've collected `cap` live entries, stop.
    const entry: KVServiceListEntry = { name: row.key };
    const expNum = typeof row.expiration === "number" ? row.expiration : undefined;
    if (expNum !== undefined) (entry as any).expiration = expNum; // surface expiration when present & live, mirroring Cloudflare auto-surface.
    const raw = (row as any).metadata;
    if (raw !== undefined && raw !== null && String(raw).length) (entry as any).metadataJson = String(raw); // only attach metadata when the provider carried some (keeps {name}-only keys bare).
    keys.push(entry);
  }

  const list_complete = rows.length <= cap; // fetched fewer than cap+1 live slots => no more data under this range/cursor window.
  let cursor: string | undefined;
  if (!list_complete && keys.length) {
    cursor = keys[keys.length - 1].name!; // continuation token = last returned name (binding layer base64url-encodes it). Exclusive on resume via k.key > ?.
  }
  return { keys, list_complete, ...(cursor !== undefined ? { cursor } : {}) };
}