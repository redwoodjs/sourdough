import {
  defineBinding,
  resolveService,
  type BindingDefinition,
  type ServiceInput,
} from "../../../src/env.js";
import type { KVService, KVServiceListEntry } from "./service.js";
import type {
  KVGetOptions,
  KVPutOptions,
  KVListOptions,
  KVNamespaceGetWithMetaResult,
  KVValueType,
} from "./types.js";

export interface KVBindingOptions {
  service: ServiceInput<KVService>;
}

/** Defines a KV namespace binding materialized under its env binding name. */
export function kv(options: KVBindingOptions): BindingDefinition<KVNamespace> {
  return defineBinding(context => new KVNamespace(resolveService(options.service, context)));
}

const MAX_KEY_BYTES = 512; // Matches Workers KV key-length limit.
const MAX_LIST_LIMIT = 1000;
export const DEFAULT_LIST_LIMIT = MAX_LIST_LIMIT; /** Public default page size, kept aligned with the enforced max (Workers' own default). Callers needing to build their own list options can use this. */

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** Cloudflare-compatible `KVNamespace`, backed by a pluggable [service](../service.ts). */
export class KVNamespace {
  constructor(private readonly service: KVService) {}

  /** Reads a value using the given read `type` and decodes it accordingly. Returns null on miss. */
  get<T extends KVValueType>(key: string, type: T): Promise<GetResult<T>>;
  /** Reads a value with options. When `type` is omitted, defaults to `"text"`. */
  get(key: string, options?: KVGetOptions): Promise<string | null>;
  /** Reads one key as `"text"` (the default). Pass an options object (or bare type literal) to decode differently. */
  get(key: string, options?: KVGetOptions | KVValueType): Promise<string | null>;
  async get(
    key: string,
    optionsOrType?: KVGetOptions | KVValueType,
  ): Promise<unknown> {
    const type = normalizeReadType(optionsOrType);
    assertKey(key);

    const result = await this.service.get(key);
    if (!result || result.value === null) return null;
    return decodeValue(result.value, type);
  }

  /** Reads a value with metadata. Pass a bare type literal or options object. */
  getWithMetadata<M = unknown>(key: string, type: KVValueType): Promise<KVNamespaceGetWithMetaResult<unknown, M>>;
  /** Reads a value with metadata using options. Defaults to `"text"`. */
  getWithMetadata<M = unknown>(key: string, options?: KVGetOptions): Promise<KVNamespaceGetWithMetaResult<unknown, M>>;
  async getWithMetadata<M = unknown>(
    key: string,
    typeOrOptions?: KVValueType | KVGetOptions,
  ): Promise<KVNamespaceGetWithMetaResult<unknown, M>> {
    const type = typeof typeOrOptions === "string"
      ? typeOrOptions
      : (typeOrOptions?.type ?? "text");
    assertKey(key);

    const result = await this.service.get(key);
    if (!result || result.value === null) return { value: null, metadata: null };
    const decoded = await decodeValue(result.value, type);
    return { value: decoded as unknown, metadata: parseMetadata<M>(result.metadataRaw ?? "") };
  }

  async put(
    key: string,
    value: string | ArrayBuffer | ArrayBufferView | ReadableStream<Uint8Array>,
    options?: KVPutOptions,
  ): Promise<void> {
    assertKey(key);
    const bytes = await toBytesOrStream(value);
    await this.service.put(key, bytes, normalizePutOptions(options));
  }

  async delete(key: string): Promise<void> {
    assertKey(key);
    await this.service.delete([key]);
  }

  async list<M = unknown>(options?: KVListOptions): Promise<KVNamespaceListResponse<M>> {
    const prefix = options?.prefix ?? "";
    // Workers exposes a limit of up to 1,000 keys per page with no default below that when omitted is left to the provider; here we forward an explicit value (defaulting to MAX_LIST_LIMIT) so behaviour matches Cloudflare. >1000 throws like the platform does.
    const rawLimit = options?.limit ?? MAX_LIST_LIMIT;
    if (!Number.isInteger(rawLimit)) throw new TypeError("KV list limit must be an integer");
    if (rawLimit < 1 || rawLimit > MAX_LIST_LIMIT) {
      throw new RangeError("KV list limit must be between 1 and " + MAX_LIST_LIMIT);
    }

    const result = await this.service.list({
      prefix,
      limit: rawLimit,
      cursor: options?.cursor ? decodeCursor(options.cursor) : undefined,
    });

    return {
      keys: result.keys.map(entry => mapListEntry<M>(entry)),
      // Cloudflare returns `list_complete` (snake_case). Existing Workers code reads this field directly; emitting camelCase would make it resolve to undefined at runtime.
      list_complete: result.list_complete,
      ...(result.cursor && !result.list_complete ? { cursor: encodeCursor(result.cursor) } : {}),
    };
  }
}

// --- public types for callers ------------------------------------------------

type GetResult<T extends KVValueType> = T extends "arrayBuffer"
  ? ArrayBuffer | null
  : T extends "json"
  ? unknown
  : T extends "stream"
  ? ReadableStream<Uint8Array> | null
  : string | null;

export interface KVNamespaceListResponse<M = unknown> {
  keys: Array<{ name: string; expiration?: number | null; metadata?: M | null }>;
  list_complete: boolean;
  cursor?: string;
}

// --- helpers -----------------------------------------------------------------

function normalizeReadType(optionsOrType?: KVGetOptions | KVValueType): KVValueType {
  if (optionsOrType === undefined) return "text";
  return typeof optionsOrType === "string" ? optionsOrType : optionsOrType.type ?? "text";
}

export function assertKey(key: string): void {
  if (typeof key !== "string") throw new TypeError("KV key must be a string");
  const bytes = new TextEncoder().encode(key);
  if (bytes.byteLength === 0) throw new Error("KV key cannot be empty");
  if (bytes.byteLength > MAX_KEY_BYTES) {
    throw new RangeError(`KV key exceeds the ${MAX_KEY_BYTES}-byte limit`);
  }
}

export function toBytes(value: string | ArrayBuffer | ArrayBufferView): Uint8Array {
  if (typeof value === "string") return encoder.encode(value);
  if (value instanceof Uint8Array) return value; // pass-through owned bytes.
  if (value instanceof ArrayBuffer) {
    const copied = value.slice(0, value.byteLength); // compact standalone copy.
    return new Uint8Array(copied);
  }
  // ArrayBufferView (DataView, Int8Array, etc.) — copy the underlying bytes.
  return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
}

export async function toBytesOrStream(
  value: string | ArrayBuffer | ArrayBufferView | ReadableStream<Uint8Array>,
): Promise<Uint8Array> {
  if (value instanceof ReadableStream) {
    const chunks: Uint8Array[] = [];
    let total = 0;
    const reader = value.getReader();
    try {
      while (true) {
        const { done, value: chunk } = await reader.read();
        if (done || !chunk) break;
        chunks.push(chunk);
        total += chunk.byteLength;
      }
    } finally {
      void reader.releaseLock();
    }
    const out = new Uint8Array(total);
    let offset = 0;
    for (const c of chunks) {
      out.set(c, offset);
      offset += c.byteLength;
    }
    return out;
  }
  return toBytes(value);
}

export async function decodeValue(
  value: Uint8Array | ReadableStream<Uint8Array>,
  type: KVValueType,
): Promise<unknown> {
  switch (type) {
    case "arrayBuffer":
      return toArrayBuffer(await asBytes(value));
    case "json":
      try {
        return JSON.parse(decoder.decode(await asBytes(value)));
      } catch (error: unknown) {
        if (error instanceof SyntaxError) throw error; // propagate bad-JSON errors like Cloudflare.
        throw new Error("Failed to decode KV value as JSON", { cause: error });
      }
    case "stream":
      return wrapStream(value);
    default:
      return decoder.decode(await asBytes(value));
  }
}

async function asBytes(value: Uint8Array | ReadableStream<Uint8Array>): Promise<Uint8Array> {
  if (value instanceof Uint8Array) return value;
  const chunks: Uint8Array[] = [];
  let total = 0;
  const reader = value.getReader();
  try {
    while (true) {
      const { done, value: chunk } = await reader.read();
      if (done || !chunk) break;
      chunks.push(chunk);
      total += chunk.byteLength;
    }
  } finally {
    void reader.releaseLock();
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = bytes.buffer as ArrayBuffer;
  if (bytes.byteOffset === 0 && bytes.byteLength === buffer.byteLength) return buffer;
  return buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

/** Wraps an in-memory value into a ReadableStream for the `"stream"` read type. */
function wrapStream(value: Uint8Array | ReadableStream<Uint8Array>): ReadableStream<Uint8Array> {
  if (!(value instanceof Uint8Array)) return value; // already a stream — pass through untouched.
  const bytes = value;
  return new ReadableStream({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
}

function parseMetadata<M>(raw: string): M | null {
  if (!raw || raw === "null") return null;
  try {
    const parsed = JSON.parse(raw);
    return (parsed === undefined ? null : parsed) as M | null;
  } catch {
    // Unparseable metadata must not crash values; surface an empty object instead.
    return {} as unknown as M;
  }
}

function normalizeListOptions(options?: KVListOptions): Required<Pick<KVListOptions, "limit" | "include">> & Pick<KVListOptions, "prefix" | "cursor"> {
  const include = options?.include
    ? Array.isArray(options.include) ? [...options.include] : [options.include as never]
    : [];
  return {
    prefix: options?.prefix ?? "",
    limit: options?.limit ?? DEFAULT_LIST_LIMIT,
    cursor: options?.cursor,
    include: Object.freeze(include),
  };
}

function mapListEntry<M>(entry: KVServiceListEntry): KVNamespaceListResponse<M>["keys"][number] {
  const out: KVNamespaceListResponse<M>["keys"][number] = { name: entry.name };
  // Cloudflare surfaces expiration/metadata automatically when present; mirror that by only attaching the fields when the provider carried them, so keys without user metadata stay as just `{ name }`.
  if (typeof entry.expiration === "number") out.expiration = entry.expiration;
  const parsedMeta = parseMetadata<M>(entry.metadataJson ?? "null");
  if (parsedMeta !== null) out.metadata = parsedMeta;
  return out;
}

function encodeCursor(name: string): string {
  return Buffer.from(name, "utf8").toString("base64url");
}

function decodeCursor(cursor: string): string | undefined {
  try {
    const decoded = Buffer.from(cursor, "base64url").toString("utf8");
    return decoded || undefined;
  } catch {
    return undefined; // invalid cursors behave as "no cursor" rather than throwing.
  }
}

function normalizePutOptions(options?: KVPutOptions): KVPutOptions | undefined {
  if (!options) return undefined;
  const expiration = options.expiration;
  const ttl = options.expirationTtl;
  const hasExpiration = expiration !== undefined;
  const hasTtl = ttl !== undefined;
  if (hasExpiration && hasTtl) throw new Error("KV put cannot specify both `expiration` and `expirationTtl`");
  const nowSeconds = Math.floor(Date.now() / 1000);
  const minExpiration = nowSeconds + 60; // Cloudflare enforces a 60-second minimum.
  if (hasExpiration) {
    if (!Number.isFinite(expiration!)) {
      throw new RangeError("KV expiration must be a finite Unix timestamp in seconds");
    }
    if (expiration! < minExpiration) {
      throw new RangeError("KV expiration must be at least 60 seconds in the future");
    }
  }
  if (hasTtl) {
    if (!Number.isFinite(ttl!) || ttl! < 60) {
      throw new RangeError("KV expirationTtl must be at least 60 seconds");
    }
  }
  return options;
}

export type { KVValueType, KVPutOptions, KVGetOptions, KVListOptions };