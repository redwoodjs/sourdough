# Binding support matrix

This document tracks every binding in Cloudflare's official
[Bindings (env) catalog](https://developers.cloudflare.com/workers/runtime-apis/bindings/).
The catalog was last reviewed on **July 14, 2026**.

The matrix describes API compatibility, not whether the corresponding
Cloudflare service can be reached through its public REST API.

## Status

- **Supported**: compatible for normal use and covered by conformance tests.
- **Partial**: an implementation exists, but API surface or behavior is missing.
- **Planned**: no implementation exists yet.

## All bindings

| Binding | Sourdough package | Status | Notes |
| --- | --- | --- | --- |
| [AI](https://developers.cloudflare.com/workers-ai/get-started/workers-wrangler/#2-connect-your-worker-to-workers-ai) | — | Planned | Workers AI model binding. |
| [Analytics Engine](https://developers.cloudflare.com/analytics/analytics-engine/) | — | Planned | Dataset write and SQL query APIs. |
| [Assets](https://developers.cloudflare.com/workers/static-assets/binding/) | — | Planned | Static asset fetch binding. |
| [Browser Run](https://developers.cloudflare.com/browser-run/) | — | Planned | Browser automation sessions. |
| [D1](https://developers.cloudflare.com/d1/worker-api/) | — | Planned | SQL database binding. |
| [Dispatcher](https://developers.cloudflare.com/cloudflare-for-platforms/workers-for-platforms/configuration/dynamic-dispatch/) | — | Planned | Workers for Platforms dispatch namespaces. |
| [Durable Object](../bindings/durable-object/) | `@redwoodjs/sourdough-durable-object` | **Partial** | SQLite storage, alarms, serialized execution, RPC, WebSockets, hibernation, and multi-process hosting exist; full conformance remains incomplete. |
| [Dynamic Worker Loaders](https://developers.cloudflare.com/workers/runtime-apis/bindings/worker-loader/) | — | Planned | Runtime loading of Worker code. |
| [Environment Variables](https://developers.cloudflare.com/workers/configuration/environment-variables/) | — | Planned | Plain-text values exposed through `env`. |
| [Hyperdrive](https://developers.cloudflare.com/hyperdrive/) | — | Planned | Database connection acceleration binding. |
| [Images](https://developers.cloudflare.com/images/optimization/binding/) | — | Planned | Image transformation binding. |
| [KV](https://developers.cloudflare.com/kv/api/) | — | Planned | Eventually consistent key-value namespaces. |
| [Media Transformations](https://developers.cloudflare.com/stream/transform-videos/bindings/) | — | Planned | Media transformation binding. |
| [mTLS](https://developers.cloudflare.com/workers/runtime-apis/bindings/mtls/) | — | Planned | Client certificate binding. |
| [Queues](https://developers.cloudflare.com/queues/configuration/javascript-apis/) | — | Planned | Queue producer API and consumer delivery semantics. |
| [R2](https://developers.cloudflare.com/r2/api/workers/workers-api-reference/) | — | Planned | Object storage bucket binding. |
| [Rate Limiting](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/) | — | Planned | Local rate-limit checks. |
| [Secrets](https://developers.cloudflare.com/workers/configuration/secrets/) | — | Planned | Secret values exposed through `env`. |
| [Secrets Store](https://developers.cloudflare.com/secrets-store/integrations/workers/) | — | Planned | Account-level secret references. |
| [Service bindings](https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/) | — | Planned | Fetch and RPC calls between Workers. |
| [Stream](https://developers.cloudflare.com/stream/manage-video-library/bindings/) | — | Planned | Video management binding. |
| [Vectorize](https://developers.cloudflare.com/vectorize/reference/client-api/) | — | Planned | Vector index API. |
| [Version metadata](https://developers.cloudflare.com/workers/runtime-apis/bindings/version-metadata/) | — | Planned | Current Worker version metadata. |
| [Workflows](https://developers.cloudflare.com/workflows/) | — | Planned | Durable multi-step workflow instances. |

## Durable Object details

The package-specific [compatibility document](../bindings/durable-object/docs/compatibility.md)
tracks the Durable Object API at method level. A binding only moves to
**Supported** after its documented API and important runtime semantics are
covered by compatibility tests.
