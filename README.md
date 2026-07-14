# Sourdough

> Pick the Cloudflare-compatible bindings you need and run them on Node.js or Nub.

Sourdough is one package with a subpath export for each self-hostable binding.
Applications import only the binding modules they use.

## Install

```bash
pnpm add @redwoodjs/sourdough
```

## Bindings

| Binding | Import | Status |
| --- | --- | --- |
| [Durable Objects](bindings/durable-object) | `@redwoodjs/sourdough/durable-object` | Partial |

See the [complete binding support matrix](docs/support-matrix.md) for every
binding exposed by the Cloudflare Developer Platform and its implementation
status in Sourdough.

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
  r2/               # future @redwoodjs/sourdough/r2 export
  ...
docs/
  support-matrix.md # status of every binding
```

Each directory under `bindings/` owns its implementation, tests, and
compatibility documentation. The root package exposes those directories as
subpath exports; bindings are modules within Sourdough, not separate packages.

See [Binding module architecture](docs/architecture.md) for the conventions a
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
