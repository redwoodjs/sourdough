# D1 support matrix

- **Tier:** 0
- **Overall status:** Planned
- **Proposed subpath:** `@redwoodjs/sourdough/d1`

## References

- [D1 Workers binding API](https://developers.cloudflare.com/d1/worker-api/)
- [D1 database methods](https://developers.cloudflare.com/d1/worker-api/d1-database/)
- [Prepared statement methods](https://developers.cloudflare.com/d1/worker-api/prepared-statements/)
- [Return objects](https://developers.cloudflare.com/d1/worker-api/return-object/)

## Database API

| Capability | Status | Compatibility target |
| --- | --- | --- |
| `prepare(query)` | Planned | Return a reusable `D1PreparedStatement`. |
| `batch(statements)` | Planned | Execute statements together and preserve result ordering. |
| `exec(query)` | Planned | Execute one or more raw SQL statements. |
| `dump()` | Planned | Return a database dump as an `ArrayBuffer`. |
| `withSession(constraint)` | Planned | Create a session using primary, unconstrained, or bookmark constraints. |

## Prepared statements and sessions

| Capability | Status | Compatibility target |
| --- | --- | --- |
| `bind(...values)` | Planned | Bind supported JavaScript values using D1 conversions. |
| `run<T>()` | Planned | Return a typed `D1Result<T>`. |
| `raw<T>(options)` | Planned | Return rows as arrays, optionally with column names. |
| `first<T>(column?)` | Planned | Return the first row, one column, or null. |
| Session `prepare` and `batch` | Planned | Execute operations within a session. |
| Session `getBookmark()` | Planned | Return the latest session bookmark. |

## Results and behavior

| Capability | Status | Compatibility target |
| --- | --- | --- |
| `D1Result` metadata | Planned | Success, results, and execution metadata. |
| `D1ExecResult` | Planned | Statement count and duration. |
| Type conversion | Planned | Match null, number, integer, string, boolean, and binary conversions. |
| Error shape | Planned | Produce compatible query, type, and constraint errors. |
| Batch transaction behavior | Planned | Match D1 rollback behavior when a statement fails. |
| Session consistency | Planned | Preserve bookmark and primary-read constraints. |

SQLite is the natural first backend, but compatibility is with D1's binding API,
not with arbitrary SQLite driver APIs.
