import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { KVNamespaceListResponse } from "./binding.js";
import { KVNamespace } from "./binding.js";
import { SQLiteKVService } from "./providers/node/sqlite.js";

describe("KVNamespace (Cloudflare-compatible surface)", () => {
  let root: string;
  // Kept so we can deterministically release the SQLite handle before afterEach removes the directory.
  let service: SQLiteKVService | null = null;
  let namespace: KVNamespace;

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), "sourdough-kv-binding-"));
    service = new SQLiteKVService({ root });
    namespace = new KVNamespace(service);
  });

  afterEach(async () => {
    void service?.close(); // release the database handle before unlinking the directory.
    service = null;
    await rm(root, { recursive: true, force: true });
  });

  it("writes and reads a value as text by default", async () => {
    await namespace.put("greeting", "hello");
    expect(await namespace.get("greeting")).toBe("hello"); // default read type is text.
  });

  it("decodes values via the requested read type (json / arrayBuffer / stream)", async () => {
    await namespace.put("number", JSON.stringify({ ok: true }));
    const parsed = await namespace.get("number", "json"); // decoded per `type`.
    expect(parsed).toEqual({ ok: true });

    await namespace.put("raw", new Uint8Array([1, 2, 3]));
    const buffer = (await namespace.get("raw", "arrayBuffer"))!; // ArrayBuffer | null -> asserted non-null.
    expect(Array.from(new Uint8Array(buffer))).toEqual([1, 2, 3]);

    await namespace.put("streamed", "payload");
    const stream = ((await namespace.get("streamed", "stream"))!) as ReadableStream<Uint8Array>; // ReadableStream | null -> asserted.
    expect(await new Response(stream).text()).toBe("payload");
  });

  it("returns null for missing keys without throwing (any read type)", async () => {
    expect(await namespace.get("missing")).toBeNull();
    expect(await namespace.get("missing", "json")).toBeNull();
    expect((await namespace.get("missing", "arrayBuffer"))).toBeNull();

    const result = await namespace.getWithMetadata<{ source: string }>("nope");
    expect(result).toEqual({ value: null, metadata: null });
  });

  it("stores and returns user metadata alongside values", async () => {
    await namespace.put("doc", "content", { metadata: { source: "env-test" } });

    const withMeta = await namespace.getWithMetadata<{ source: string }>("doc");
    expect(withMeta.value).toBe("content");
    expect(withMeta.metadata).toEqual({ source: "env-test" });
  });

  it("rejects past expiration and expires entries lazily once alive", async () => {
    const now = Math.floor(Date.now() / 1000);

    // An already-past expiration is rejected (Cloudflare treats this as an error).
    await expect(namespace.put("past", "gone", { expiration: now - 5 })).rejects.toThrow(/future/i);

    // A freshly written TTL entry reads immediately...
    await namespace.put("ephemeral", "still here", { expirationTtl: 1 });
    const before = (await namespace.get("ephemeral"))!; // default text.
    expect(before).toBe("still here");

    // ...and disappears from both read and listing once the TTL elapses (lazy expiry).
    await new Promise(r => setTimeout(r, 1_700));
    expect(await namespace.get("ephemeral")).toBeNull();
    const listed = (await namespace.list({})) as KVNamespaceListResponse;
    expect(listed.keys.map(k => k.name)).not.toContain("ephemeral");
  });

  it("deletes keys and reports whether anything existed", async () => {
    expect(await namespace.delete(["only"])).toBe(false);

    await namespace.put("a", "1");
    expect(await namespace.delete(["a"])).toBe(true);
    expect(await namespace.get("a")).toBeNull();

    // Bulk delete across mixed presence: true when at least one existed.
    await namespace.put("b", "2");
    expect(await namespace.delete(["missing", "b"])).toBe(true);
  });

  it("lists keys lexicographically, paginated by an opaque cursor token", async () => {
    for (let i = 0; i < 50; i++) await namespace.put(`key-${i.toString().padStart(3, "0")}`, String(i));

    const page1 = (await namespace.list({ limit: 20 })) as KVNamespaceListResponse;
    expect(page1.keys.length).toBe(20);
    // Workers returns `list_complete` (snake_case) — asserting presence guards against the camelCase regression.
    expect(((page1 as unknown) as Record<string, unknown>).listComplete).toBeUndefined();
    expect(page1.list_complete).toBe(false);
    expect(typeof page1.cursor).toBe("string");

    // Cursor is exclusive-of-last-returned; the next page continues deterministically.
    const page2 = (await namespace.list({ limit: 20, cursor: page1.cursor })) as KVNamespaceListResponse;
    expect(page2.keys.length).toBe(20);
    expect(page2.keys[0]!.name).not.toBe(page1.keys.at(-1)!.name);

    // Drain remaining pages (odd size exercises boundary handling) and reassemble in order.
    const seen: string[] = [...page1.keys.map(k => k.name), ...page2.keys.map(k => k.name)];
    let cursor: string | undefined = page2.cursor;
    while (cursor) {
      const next = (await namespace.list({ limit: 7, cursor })) as KVNamespaceListResponse;
      for (const key of next.keys) seen.push(key.name);
      cursor = next.cursor;
    }

    expect(seen).toHaveLength(50); // every key appeared exactly once across pages.
    for (let i = 1; i < seen.length; i++) {
      expect((seen[i]! > seen[i - 1]!) as boolean).toBe(true); // strictly ascending sequence across boundaries.
    }

    const complete = (await namespace.list({ limit: 50 })) as KVNamespaceListResponse;
    expect(complete.list_complete).toBe(true);
    expect(complete.cursor).toBeUndefined();
  });

  it("honors prefix filtering and returns only matching keys", async () => {
    for (const k of ["alpha/1", "alpha/2", "beta/1"]) await namespace.put(k, k);
    const alpha = (await namespace.list({ prefix: "alpha/" })) as KVNamespaceListResponse;
    expect(alpha.keys.map(k => k.name)).toEqual(["alpha/1", "alpha/2"]);
  });

  it("surfaces expiration and metadata automatically when present (no selector)", async () => {
    // A key WITH both TTL and user metadata: list must carry both, regardless of any `include` flag.
    await namespace.put("m", "v", { expirationTtl: 90, metadata: { tag: "t" } });

    const listed = (await namespace.list({})) as KVNamespaceListResponse;
    expect(listed.keys[0]).toMatchObject({ name: "m", metadata: { tag: "t" }, expiration: expect.any(Number) as unknown });
    // `include` is accepted for compatibility but does not gate fields — results are identical with it set.
    const alsoListed = (await namespace.list({ include: ["metadata", "expiration"] })) as KVNamespaceListResponse;
    expect(alsoListed.keys[0]).toEqual(listed.keys[0]);

    // A key with no metadata/expiration stays a bare { name } entry, like Cloudflare omits those fields.
    await namespace.put("plain", "v");
    const plain = (await namespace.list({ prefix: "plain" })) as KVNamespaceListResponse;
    expect(Object.keys(plain.keys[0]!)).toEqual(["name"]);
  });

  it("rejects empty and oversized keys", async () => {
    await expect(namespace.put("", "v")).rejects.toThrow(/empty/i);
    await expect(namespace.put("x".repeat(513), "v")).rejects.toThrow(/exceed|limit/);
  });

  it("rethrows bad JSON as a SyntaxError via the json read type", async () => {
    await namespace.put("bad", "{not json");
    await expect(namespace.get("bad", "json")).rejects.toThrow(SyntaxError);
  });

  it("treats put options that specify both expiration and ttl as invalid", async () => {
    const now = Math.floor(Date.now() / 1000) + 3600;
    await expect(namespace.put("conflict", "v", { expiration: now, expirationTtl: 60 })).rejects.toThrow(/both/i);
  });

  it("validates that user metadata is JSON-serializable", async () => {
    const circular = { a: {} } as any; // cyclic shape defeats JSON.stringify at runtime.
    (circular.a as any).self = circular;
    await expect(namespace.put("cycle", "v", { metadata: circular })).rejects.toThrow(/JSON/i);
  });

  it("round-trips binary values through buffer-backed get/put", async () => {
    // Regression for SQLite BLOB handling — bytes must survive a put/get cycle unchanged.
    const bytes = new Uint8Array(2_048);
    crypto.getRandomValues(bytes);
    await namespace.put("bin", bytes);
    const again = (await namespace.get("bin", "arrayBuffer")) as ArrayBuffer;
    expect(Array.from(new Uint8Array(again))).toEqual(Array.from(bytes));
  });
});