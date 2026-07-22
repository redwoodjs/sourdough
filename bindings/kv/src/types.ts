// Cloudflare-facing type surface for Workers KV.
// Mirrors the public shapes published under
// https://developers.cloudflare.com/kv/api/ so application code written against
// `@cloudflare/workers-types` keeps compiling when imported from Sourdough.

/** How `KVNamespace.get` decodes a stored value. Defaults to `"text"`. */
export type KVValueType = "arrayBuffer" | "json" | "stream" | "text";

/** Decoded read result for each recognized `KVValueType`. */
export interface KVValueTypes {
  arrayBuffer: ArrayBuffer;
  json: unknown;
  stream: ReadableStream<Uint8Array>;
  text: string;
}

export interface KVGetOptions {
  /** Read type. Defaults to `"text"`. */
  type?: KVValueType;
  /**
   * Hint (in seconds) that a cached copy is acceptable. Sourdough's local
   * providers do not maintain a CDN cache layer; this option is accepted for
   * compatibility but does not change the freshness of returned data.
   */
  cacheTtl?: number;
}

export interface KVPutOptions {
  /** Unix timestamp **in seconds** at which the entry expires (deleted lazily). */
  expiration?: number;
  /** Relative TTL **in seconds**. Cannot be combined with `expiration`. */
  expirationTtl?: number;
  /** Arbitrary metadata serialized as JSON and returned by read/metadata APIs. */
  metadata?: unknown;
}

/** Accepted selector tokens for Sourdough's list API (retained for compatibility). */
export type KVListResultInclude = "metadata" | "expiration";
// NOTE: real Workers KV `list()` returns expiration/metadata automatically when present and has no R2-style selector. Sourdough keeps the `include` field so existing callers keep compiling, but does NOT gate fields on it — all provider data that a key carries is surfaced at the adapter boundary, mirroring Cloudflare's behavior rather than inventing a new one.
export interface KVListOptions {
  prefix?: string;
  limit?: number; // Default page size is 1000 (Workers' own default); upper bound is also 1000 and values above it throw a RangeError to match the platform.
  cursor?: string;
  /** Tolerated but ignored: Workers KV exposes these fields automatically when present, so no selector is needed at this layer. */
  include?: readonly KVListResultInclude[];
}

/** A single key returned by `KVNamespace.list`. */
export interface KVNamespaceListKey<M = unknown> {
  name: string;
  expiration?: number | null; // Included automatically when the entry carries one (Workers surfaces this without a selector).
  metadata?: M | null; // Included automatically when the entry carries some.
}

/** The result of a paginated `list()` call — mirrors Cloudflare's KVNamespaceListResult shape exactly at the adapter boundary. */
export interface KVNamespaceListResult<M = unknown> {
  keys: Array<KVNamespaceListKey<M>>;
  /** True when the listing is complete within this page (no cursor needed). Matches Workers' snake_case `list_complete`. */
  list_complete: boolean;
  /** Opaque continuation token, present only while more entries remain. */
  cursor?: string;
}

/** Result of `getWithMetadata`, which always resolves to an object even on miss. */
export interface KVNamespaceGetWithMetaResult<V = unknown, M = unknown> {
  value: V | null;
  metadata: M | null;
}