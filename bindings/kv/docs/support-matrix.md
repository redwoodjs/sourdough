# KV support matrix

- **Tier:** 0
- **Overall status:** Partial — `@redwoodjs/r2`-style binding implemented; Tier 0 namespace API complete via a Node.js filesystem provider. Remaining gaps are concurrency/expiry timing semantics and global-distributor parity (see "Known gaps").
- **Subpaths:** `@redwoodjs/kv` (adapter) + `@redwoodjs/kv/node` (filesystem service descriptor).

## References

- [Workers KV binding API](https://developers.cloudflare.com/kv/api/)
- [Read key-value pairs](https://developers.cloudflare.com/kv/api/read-key-value-pairs/)
- [Write key-value pairs](https://developers.cloudflare.com/kv/api/write-key-value-pairs/)
- [List keys](https://developers.cloudflare.com/kv/api/list-keys/)

## Namespace API

| Capability | Status | Compatibility target / notes |
| --- | --- | --- |
| `get(key)` | Supported | Reads one key; default read type is `"text"`, returns `null` on miss. |
| Bulk `get(keys)` → `Map` | Planned | Workers supports bulk-read of keys into a map; not yet implemented locally. |
| Read types (`text`, `json`, `arrayBuffer`, `stream`) | Supported | All four decode modes behave like Cloudflare for present/missing values. Bad JSON rethrows as `SyntaxError`. |
| `getWithMetadata(key)` / bulk form | Partial (single-key) | Single-key `getWithMetadata` returns `{value, metadata}`; per-call options honored. Bulk `Map`-returning forms are planned. |
| `put(key, value)` | Supported | Accepts strings and binary values (`ArrayBuffer`/`Uint8Array`). |
| Put expiration | Partial | Both absolute `expiration` (Unix seconds) and relative `expirationTtl` are enforced; past/non-finite values reject like Cloudflare. Lazy expiry on read/list — no background GC daemon. |
| Put metadata | Supported | Arbitrary JSON-serializable metadata stored alongside the value and round-tripped through reads/lists. Non-serializable bodies throw a `TypeError`. |
| `delete(key)` / bulk `delete(keys)` → boolean | Supported | Idempotent; resolves true when at least one key existed, false otherwise. |
| `list(options)` | Partial | Supports `prefix`, `limit` (1–1000 enforced), opaque `cursor` pagination, and `include: ["metadata"|"expiration"]`. Key ordering is lexicographic on the string representation; byte-order edge cases for multi-byte keys are not yet covered. |

## Runtime semantics

| Behavior | Status | Notes |
| --- | --- | --- |
| Eventual consistency | Planned | Local provider offers strong per-process consistency only — do not model global KV eventual consistency here. |
| Per-key write ordering | Partial | Writes to the same key from concurrent requests within one process are serialized by Node's single-threaded execution; cross-node/distributed per-key ordering is out of scope for the Tier 0 local adapter. |
| Expiration | Supported | Expired values are invisible to reads and listings (removed lazily on access). No proactive sweep in this milestone. |
| Cursor pagination | Partial | Cursors are opaque base64url tokens stable for their dataset lifetime within a process; they remain valid while no entries change between pages, matching the documented contract today. Edge cases around mutation between page calls are untested. |
| Cache TTL option (`cacheTtl`) | Documented gap | The local providers hold no CDN cache layer; `cacheTtl` is accepted for compatibility but does not alter freshness semantics (returns current stored value). |
| Namespace isolation | Supported | Each provider instance has its own on-disk root (default `.sourdough/kv/<binding-name>`), hashed-safe; bindings cannot read each other's keys. |

## Service contract and providers

The Cloudflare-facing `@redwoodjs/kv` adapter depends only on the backend-agnostic `KVService` contract in [`service.ts`](../kv/src/service.ts). Third-party providers (Nub, etc.) can implement that interface without changing application code.

| Provider | Runtime | Status | Notes |
| --- | --- | --- | --- |
| `FileSystemKVService` (`@redwoodjs/kv/node`) | Node.js 24 | Partial | Persistent local filesystem provider with hashed-safe key filenames, atomic writes via rename, per-key metadata + expiration sidecars, lazy expiry, lexicographic listing, and cursor pagination. |
| Nub provider | Nub | Planned | Should implement the same `KVService` contract and its conformance suite. |

## Known gaps (non-blocking for Tier 0)

- Global strong consistency across machines / Cloudflare's eventual-consistency model is intentionally not promised by the local adapter.
- Background expiration daemon: expiry currently happens on read/list only.
- Bulk `get(keys)` returning a keyed map, and per-key ordering guarantees under concurrent cross-process writes.
- Cursor validity after mutations between paged calls (only stable when the underlying set does not change).
- No built-in rate limiting or request-level cache TTL enforcement for `cacheTtl`; documented rather than implemented locally.

The matrix remains conservative; rows move to **Supported** only after compatibility tests cover both the API and their important runtime semantics.
