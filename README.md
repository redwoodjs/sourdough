# Sourdough

> Pick the Cloudflare-compatible bindings you need and run them on Node.js or Nub.

Sourdough is a collection of independent, self-hostable binding implementations.
Each binding lives in its own package, so an application can install one binding
without pulling in the rest of the platform.

## Bindings

| Binding | Package | Status |
| --- | --- | --- |
| [Durable Object](bindings/durable-object) | `@redwoodjs/sourdough-durable-object` | Partial |

See the [complete binding support matrix](docs/support-matrix.md) for every
binding exposed by the Cloudflare Developer Platform and its implementation
status in Sourdough.

## Install only what you need

```bash
pnpm add @redwoodjs/sourdough-durable-object
```

```typescript
import { DurableObject } from "@redwoodjs/sourdough-durable-object";

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
  durable-object/   # Durable Object API, storage, host runtime, tests, and docs
  kv/               # future KV binding package
  r2/               # future R2 binding package
  ...
docs/
  support-matrix.md # status of every binding
```

Every directory under `bindings/` is intended to be independently installable,
testable, and documented. Cross-binding orchestration should compose these
packages rather than make them depend on one large umbrella package.

See [Binding package architecture](docs/architecture.md) for the conventions a
new binding should follow.

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
