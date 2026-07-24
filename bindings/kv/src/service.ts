// Backend-agnostic contract for Workers KV. Providers implement it; the public
// Cloudflare-facing adapter depends only on this interface.

import type { KVPutOptions, KVListOptions } from "./types.js";

/** Resolved by a backend after reading one key: value bytes (or null) plus raw metadata text. */
export interface KVServiceGetResult {
  /** `null` when the key is missing or has expired (the binding returns null). */
  readonly value: Uint8Array | ReadableStream<Uint8Array> | null;
  /** Stored user metadata as its original JSON serialization, or `null`. */
  readonly metadataRaw: string | null;
}

/** A single entry produced by a backend listing. */
export interface KVServiceListEntry {
  name: string;
  expiration?: number | null; // seconds-since-epoch when the key expires (if any).
  /** Raw serialization of stored user metadata, present only if `"metadata"` was requested. */
  metadataJson?: string | null;
}

/** Backend-independent response for a paginated listing query. */
export interface KVServiceListResponse {
  keys: KVServiceListEntry[];
  list_complete: boolean;
  cursor?: string; // opaque continuation token from the backend (e.g. last returned name), if more remain.
}

/**
 * Backend-agnostic service contract used by the Cloudflare-facing KV adapter.
 * A backend stores whole values durably and tracks expiration + metadata; it is
 * responsible for skipping or purging expired keys on read and list, isolating
 * data per namespace root, and surfacing a stable opaque cursor across pages.
 */
export interface KVService {
  get(key: string): Promise<KVServiceGetResult>;
  put(
    key: string,
    value: Uint8Array | ReadableStream<Uint8Array>,
    options?: KVPutOptions,
  ): Promise<void>;
  /** Deletes every existing key in `keys`; resolves true if at least one existed. */
  delete(keys: string[]): Promise<boolean>;
  list(options?: KVListOptions): Promise<KVServiceListResponse>;
}

// Re-export so convenience consumers can import everything contract-related from here.
export type { KVPutOptions, KVListOptions };