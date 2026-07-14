# Sourdough

> Pick the Cloudflare-compatible bindings you need and run them on Node.js or Nub.

> [!WARNING]
> **Work in progress.** Sourdough is experimental, incomplete, and not yet
> published to npm. The APIs, import paths, and support targets may change.

Sourdough is one package with a subpath export for each self-hostable binding.
Applications import only the binding modules they use.

## Installation

Sourdough is not yet published. Once an initial release is available, it will
be installed with:

```bash
pnpm add @redwoodjs/sourdough
```

## Tier 0 bindings

| Binding | Import | Status |
| --- | --- | --- |
| Environment variables | `@redwoodjs/sourdough/environment-variables` | Planned |
| Secrets | `@redwoodjs/sourdough/secrets` | Planned |
| Service binding | `@redwoodjs/sourdough/service-binding` | Planned |
| [Durable Object](bindings/durable-object) | `@redwoodjs/sourdough/durable-object` | Partial |
| KV | `@redwoodjs/sourdough/kv` | Planned |
| [R2](bindings/r2) | `@redwoodjs/sourdough/r2` | Partial |
| D1 | `@redwoodjs/sourdough/d1` | Planned |
| Queue | `@redwoodjs/sourdough/queue` | Planned |
| Assets | `@redwoodjs/sourdough/assets` | Planned |

Tier 0 is the minimum binding set Sourdough intends to support. See the
[complete binding support matrix](docs/support-matrix.md) for detailed targets
and the uncategorized Cloudflare bindings.

## Import only what you need

```typescript
import { DurableObject } from "@redwoodjs/sourdough/durable-object";

export class Counter extends DurableObject {
  async fetch() {
    const value = ((await this.ctx.storage.get<number>("value")) ?? 0) + 1;
    await this.ctx.storage.put("value", value);
    return new Response(String(value));
  }
}
```

## Repository layout

```text
bindings/
  durable-object/   # exported as @redwoodjs/sourdough/durable-object
  kv/               # future @redwoodjs/sourdough/kv export
  r2/               # @redwoodjs/sourdough/r2 plus Node.js provider
  ...
docs/
  support-matrix.md # status of every binding
```

Each directory under `bindings/` owns its implementation, tests, and
compatibility documentation. The root package exposes those directories as
subpath exports; bindings are modules within Sourdough, not separate packages.

See [Binding module architecture](docs/architecture.md) for repository
conventions and the [service adapter model](docs/service-adapter-model.md) for
the separation between Cloudflare APIs, portable service contracts, providers,
and runtime hosts.

## Runtime support

Node.js 24 is the current development runtime. Nub support is planned as the
Nub runtime takes shape.

## Development

```bash
corepack enable
pnpm install
pnpm typecheck
pnpm test
```

## Independence and compatibility

Sourdough aims for API compatibility so application code can use familiar
binding APIs outside Cloudflare's infrastructure. Sourdough is independent and
is not affiliated with or endorsed by Cloudflare, Inc. “Cloudflare” and
“Durable Objects” are trademarks of Cloudflare, Inc.

## License

[MIT](LICENSE.md)
