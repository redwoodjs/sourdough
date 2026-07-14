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

## Compose bindings on `env`

```typescript
import { defineEnv } from "@redwoodjs/sourdough";
import { r2 } from "@redwoodjs/sourdough/r2";
import { fileSystem } from "@redwoodjs/sourdough/r2/node";

export const env = defineEnv({
  BUCKET: r2({
    service: fileSystem(),
  }),
});

await env.BUCKET.put("hello.txt", "Hello");
```

The default Node.js filesystem path is `.sourdough/r2/BUCKET`. Durable Object
namespaces use the same model through `durableObject()` and
`nodeDurableObjects()`. See [`env` composition](docs/env-composition.md) for
explicit paths, shared services, and custom providers.

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
conventions, the [service adapter model](docs/service-adapter-model.md) for the
separation between APIs and providers, and [`env` composition](docs/env-composition.md)
for wiring named bindings to service implementations.

## Runtime support

Node.js 24 is the current development runtime. Nub support is planned as the
Nub runtime takes shape.

## Development

```bash
corepack enable
pnpm install
pnpm typecheck
pnpm test
pnpm bench
```

Every pull request compares its benchmarks with the base commit on the same
runner. Historical results are published to
[`redwoodjs/sourdough-benchmarks`](https://github.com/redwoodjs/sourdough-benchmarks).
See the [benchmark conventions](benchmarks/README.md) for naming, thresholds,
and regression policy.

## Independence and compatibility

Sourdough aims for API compatibility so application code can use familiar
binding APIs outside Cloudflare's infrastructure. Sourdough is independent and
is not affiliated with or endorsed by Cloudflare, Inc. “Cloudflare” and
“Durable Objects” are trademarks of Cloudflare, Inc.

## License

[MIT](LICENSE.md)
