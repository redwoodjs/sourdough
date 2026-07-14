# Sourdough Durable Object binding

A self-hostable implementation of the Cloudflare Durable Object API for Node.js
and, eventually, Nub.

> [!WARNING]
> This binding is a work in progress and has not been published to npm.

## Installation

Once Sourdough is published:

```bash
pnpm add @redwoodjs/sourdough
```

## Usage

```typescript
import {
  ClusterCoordinator,
  DurableObject,
} from "@redwoodjs/sourdough/durable-object";

class Counter extends DurableObject {
  async fetch() {
    const value = ((await this.ctx.storage.get<number>("value")) ?? 0) + 1;
    await this.ctx.storage.put("value", value);
    return new Response(String(value));
  }
}

const coordinator = new ClusterCoordinator();
const counter = await coordinator.get("counter-1", Counter);
const response = await counter.fetch(new Request("http://localhost"));

console.log(await response.text());
```

The exported class is named `DurableObject` to match the Cloudflare API. The
subpath identifies this as Sourdough's implementation; application-facing API
names should remain compatible.

## Documentation

- [Support matrix](docs/support-matrix.md)
- [`env` composition and Node.js defaults](../../docs/env-composition.md)
- [Host process model](docs/host-process-model.md)
- [Repository-wide support matrix](../../docs/support-matrix.md)

## Status

This binding module is experimental and partially compatible. See the support
matrix for implemented behavior and known gaps.
