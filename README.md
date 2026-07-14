# Sourdough

> Portable, self-hostable stateful actors for Node.js and Nub.

Sourdough is an experimental actor runtime for building stateful applications
that can run on your own infrastructure. Its API is modeled after Cloudflare's
Durable Objects, with SQLite persistence and support for running many isolated
actor instances across a pool of local host processes.

Sourdough is an independent project and is not affiliated with or endorsed by
Cloudflare, Inc. “Cloudflare” and “Durable Objects” are trademarks of
Cloudflare, Inc.

## Project status

Sourdough is early-stage software extracted from an experimental RedwoodSDK
branch. Node.js 24 is the current development runtime. Nub support is planned
as the Nub runtime takes shape.

## Features

- SQLite-backed key-value and SQL storage
- Serialized execution for each actor instance
- Alarms and background work with `waitUntil`
- RPC stubs for calling actor methods
- WebSocket tracking, hibernation, and broadcasting
- Optional multi-process hosting over Unix domain sockets

## Usage

Define a stateful actor:

```typescript
import { OpenDurableObject } from "@redwoodjs/sourdough";

export class Counter extends OpenDurableObject {
  async fetch() {
    const value = ((await this.storage.get<number>("value")) ?? 0) + 1;
    await this.storage.put("value", value);

    return new Response(String(value));
  }
}
```

Create a coordinator and get an actor stub:

```typescript
import { ClusterCoordinator } from "@redwoodjs/sourdough";
import { Counter } from "./counter.js";

const coordinator = new ClusterCoordinator();
const counter = await coordinator.get("counter-1", Counter);
const response = await counter.fetch(new Request("http://localhost"));

console.log(await response.text());
```

## Development

```bash
corepack enable
pnpm install
pnpm typecheck
pnpm test
```

## Documentation

- [Feature matrix](docs/matrix.md)
- [Host process model](docs/host-process-model.md)

## License

[MIT](LICENSE.md)
