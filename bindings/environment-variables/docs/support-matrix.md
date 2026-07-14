# Environment variables support matrix

- **Tier:** 0
- **Overall status:** Planned
- **Proposed subpath:** `@redwoodjs/sourdough/environment-variables`

Environment variables are foundational to the shared `env` model used by every
other binding. Text and JSON values must behave like ordinary values on `env`;
they are not a remote service.

## References

- [Environment variables](https://developers.cloudflare.com/workers/configuration/environment-variables/)
- [Bindings (`env`)](https://developers.cloudflare.com/workers/runtime-apis/bindings/)

## API and configuration

| Capability | Status | Compatibility target |
| --- | --- | --- |
| Text values | Planned | Expose configured strings on `env`. |
| JSON values | Planned | Preserve parsed arrays, objects, numbers, and booleans on `env`. |
| Fetch handler injection | Planned | Pass the same `env` object to Worker-style fetch handlers. |
| Entrypoint and Durable Object access | Planned | Expose values through the instance `env` property. |
| Global `env` import | Planned | Provide compatibility for `env` imported from `cloudflare:workers`. |
| `withEnv` overrides | Planned | Scope temporary binding overrides for tests and nested calls. |
| Per-environment values | Planned | Select independent development, staging, and production values. |
| Node.js `process.env` | Planned | Lazily expose string values and JSON-encode non-string values. |
| Local dotenv loading | Planned | Support `.dev.vars` and `.env` precedence compatible with Wrangler. |
| Required-variable validation | Planned | Fail clearly when declared values are missing. |

## Runtime semantics

| Behavior | Status | Notes |
| --- | --- | --- |
| Request-consistent snapshot | Planned | A request sees one stable set of binding values. |
| Binding-only reloads | Planned | Updating configuration must not require application code changes. |
| Isolation between applications | Planned | Values must not leak across Worker instances or environments. |

Environment variables and secrets share runtime delivery machinery, but remain
separate support matrices because secrets require different storage and
operational guarantees.
