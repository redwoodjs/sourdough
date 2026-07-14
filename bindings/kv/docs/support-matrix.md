# KV support matrix

- **Tier:** 0
- **Overall status:** Planned
- **Proposed subpath:** `@redwoodjs/sourdough/kv`

## References

- [Workers KV binding API](https://developers.cloudflare.com/kv/api/)
- [Read key-value pairs](https://developers.cloudflare.com/kv/api/read-key-value-pairs/)
- [Write key-value pairs](https://developers.cloudflare.com/kv/api/write-key-value-pairs/)
- [List keys](https://developers.cloudflare.com/kv/api/list-keys/)

## Namespace API

| Capability | Status | Compatibility target |
| --- | --- | --- |
| `get(key)` | Planned | Read one key as text by default. |
| `get(keys)` | Planned | Bulk-read keys into a `Map`. |
| Read types | Planned | Support `text`, `json`, `arrayBuffer`, and `stream` where Cloudflare does. |
| `getWithMetadata(key)` | Planned | Return the value with user metadata. |
| `getWithMetadata(keys)` | Planned | Bulk-read values and metadata. |
| `put(key, value)` | Planned | Accept strings, streams, and binary values. |
| Put expiration | Planned | Support absolute `expiration` and relative `expirationTtl`. |
| Put metadata | Planned | Store JSON-serializable metadata with a value. |
| `delete(key)` | Planned | Delete one key idempotently. |
| `list(options)` | Planned | Support prefix, limit, cursor, metadata, and expirations. |

## Runtime semantics

| Behavior | Status | Notes |
| --- | --- | --- |
| Eventual consistency | Planned | Avoid accidentally promising strong global consistency. |
| Per-key write ordering | Planned | Define behavior for concurrent writes to the same key. |
| Expiration | Planned | Expired values disappear from reads and listings. |
| Cursor pagination | Planned | Cursors remain opaque and stable for their documented lifetime. |
| Cache TTL option | Planned | Honor `cacheTtl` or document the local equivalent. |
| Namespace isolation | Planned | Keep data isolated by binding and application. |

A local adapter may use SQLite initially, but the public behavior must remain KV
compatible rather than expose SQLite semantics.
