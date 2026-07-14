# Binding support matrix

This document tracks every binding in Cloudflare's official
[Bindings (`env`) catalog](https://developers.cloudflare.com/workers/runtime-apis/bindings/).
The catalog was last reviewed on **July 14, 2026**.

Priority tier and implementation status are separate:

- **Tier 0** identifies the minimum binding set required for a useful Sourdough
  application platform.
- **Partial** means an implementation exists but still has compatibility gaps.
- **Planned** means the binding is in scope but has no implementation yet.
- **Uncategorized** bindings have not been assigned a priority tier.

## Tier 0

| Binding | Sourdough import | Status | Detailed matrix |
| --- | --- | --- | --- |
| Environment variables | `@redwoodjs/sourdough/environment-variables` | Planned | [Support matrix](../bindings/environment-variables/docs/support-matrix.md) |
| Secrets | `@redwoodjs/sourdough/secrets` | Planned | [Support matrix](../bindings/secrets/docs/support-matrix.md) |
| Service binding | `@redwoodjs/sourdough/service-binding` | Planned | [Support matrix](../bindings/service-binding/docs/support-matrix.md) |
| Durable Object | `@redwoodjs/sourdough/durable-object` | **Partial** | [Support matrix](../bindings/durable-object/docs/support-matrix.md) |
| KV | `@redwoodjs/sourdough/kv` | Planned | [Support matrix](../bindings/kv/docs/support-matrix.md) |
| [R2](../bindings/r2/) | `@redwoodjs/sourdough/r2` | **Partial** | [Support matrix](../bindings/r2/docs/support-matrix.md) |
| D1 | `@redwoodjs/sourdough/d1` | Planned | [Support matrix](../bindings/d1/docs/support-matrix.md) |
| Queue | `@redwoodjs/sourdough/queue` | Planned | [Support matrix](../bindings/queue/docs/support-matrix.md) |
| Assets | `@redwoodjs/sourdough/assets` | Planned | [Support matrix](../bindings/assets/docs/support-matrix.md) |

Planned bindings show their proposed import path. The path becomes a public
package export when implementation work begins.

## Uncategorized

These bindings are part of Cloudflare's current catalog but do not have a
Sourdough priority tier yet.

| Binding | Cloudflare reference |
| --- | --- |
| AI | [Workers AI binding](https://developers.cloudflare.com/workers-ai/get-started/workers-wrangler/#2-connect-your-worker-to-workers-ai) |
| Analytics Engine | [Analytics Engine](https://developers.cloudflare.com/analytics/analytics-engine/) |
| Browser Run | [Browser Run](https://developers.cloudflare.com/browser-run/) |
| Dispatcher | [Workers for Platforms dispatcher](https://developers.cloudflare.com/cloudflare-for-platforms/workers-for-platforms/configuration/dynamic-dispatch/) |
| Dynamic Worker Loaders | [Worker loaders](https://developers.cloudflare.com/workers/runtime-apis/bindings/worker-loader/) |
| Hyperdrive | [Hyperdrive](https://developers.cloudflare.com/hyperdrive/) |
| Images | [Images binding](https://developers.cloudflare.com/images/optimization/binding/) |
| Media Transformations | [Media Transformations binding](https://developers.cloudflare.com/stream/transform-videos/bindings/) |
| mTLS | [mTLS binding](https://developers.cloudflare.com/workers/runtime-apis/bindings/mtls/) |
| Rate Limiting | [Rate Limiting binding](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/) |
| Secrets Store | [Secrets Store binding](https://developers.cloudflare.com/secrets-store/integrations/workers/) |
| Stream | [Stream binding](https://developers.cloudflare.com/stream/manage-video-library/bindings/) |
| Vectorize | [Vectorize client API](https://developers.cloudflare.com/vectorize/reference/client-api/) |
| Version metadata | [Version metadata binding](https://developers.cloudflare.com/workers/runtime-apis/bindings/version-metadata/) |
| Workflows | [Workflows](https://developers.cloudflare.com/workflows/) |

The matrix describes API compatibility, not whether a Cloudflare-hosted service
can be reached through its public REST API.
