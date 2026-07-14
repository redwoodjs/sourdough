# Secrets support matrix

- **Tier:** 0
- **Overall status:** Planned
- **Proposed subpath:** `@redwoodjs/sourdough/secrets`

To application code, a secret behaves like a string environment variable. The
difference is how it is stored, displayed, updated, and passed to the runtime.

## References

- [Secrets](https://developers.cloudflare.com/workers/configuration/secrets/)
- [Environment variables](https://developers.cloudflare.com/workers/configuration/environment-variables/)

## Runtime API

| Capability | Status | Compatibility target |
| --- | --- | --- |
| Fetch handler `env` access | Planned | Expose secret values through the request's `env` object. |
| Entrypoint and Durable Object access | Planned | Expose secrets through the instance `env` property. |
| Global `env` import | Planned | Make secrets available through `cloudflare:workers` compatibility. |
| Node.js `process.env` | Planned | Populate secrets when Node.js environment compatibility is enabled. |
| Required-secret validation | Planned | Reject startup or deployment when a declared secret is absent. |

## Local development

| Capability | Status | Compatibility target |
| --- | --- | --- |
| `.dev.vars` loading | Planned | Load dotenv-formatted local secrets. |
| `.env` loading | Planned | Apply Cloudflare-compatible file precedence. |
| Environment-specific files | Planned | Support `.dev.vars.<environment>` and `.env.<environment>` variants. |
| Process environment fallback | Planned | Optionally source declared secrets from `process.env`. |

## Security and lifecycle

| Behavior | Status | Notes |
| --- | --- | --- |
| Encrypted persistence | Planned | Never store deployed secret values as plaintext. |
| Write-only management views | Planned | Management APIs must not reveal a stored value after creation. |
| Redaction | Planned | Avoid including values in diagnostics and configuration output. |
| Versioned updates | Planned | Secret updates must produce an atomic runtime configuration version. |
| Application isolation | Planned | Secrets must not cross application or environment boundaries. |

Cloudflare Secrets Store is a separate binding and is not part of Tier 0.
