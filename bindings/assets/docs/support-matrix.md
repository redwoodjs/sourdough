# Assets support matrix

- **Tier:** 0
- **Overall status:** Planned
- **Proposed subpath:** `@redwoodjs/sourdough/assets`

## Reference

- [Static Assets configuration and binding](https://developers.cloudflare.com/workers/static-assets/binding/)

## Binding API

| Capability | Status | Compatibility target |
| --- | --- | --- |
| `env.ASSETS.fetch(request)` | Planned | Resolve a `Request` against the configured asset directory. |
| URL and string inputs | Planned | Accept the same fetch input forms as the Cloudflare binding. |
| Standard `Response` | Planned | Return body, content type, ETag, and cache headers. |
| Missing asset response | Planned | Apply configured not-found handling. |
| Range and conditional requests | Planned | Support browser caching and partial content. |
| HEAD requests | Planned | Return headers without reading the full body. |

## Configuration and routing

| Capability | Status | Compatibility target |
| --- | --- | --- |
| Asset directory | Planned | Bind one configured directory as `ASSETS`. |
| Ignore rules | Planned | Exclude configured files from the asset manifest. |
| `run_worker_first` | Planned | Support boolean and route-pattern forms. |
| HTML handling | Planned | Apply configured clean-URL behavior. |
| Not-found handling | Planned | Support 404, SPA, and 404-page behavior. |
| Redirects | Planned | Apply static redirect rules. |
| Headers | Planned | Apply static response header rules. |

## Runtime semantics

| Behavior | Status | Notes |
| --- | --- | --- |
| Safe path resolution | Planned | Prevent traversal outside the configured asset root. |
| Content type detection | Planned | Match expected MIME types. |
| ETag generation | Planned | Produce stable validators for unchanged assets. |
| Streaming | Planned | Stream large files with backpressure. |
| Immutable deployment view | Planned | A request sees a consistent asset manifest. |

The local implementation should use the filesystem first while preserving an
adapter boundary for packaged or remote asset stores.
