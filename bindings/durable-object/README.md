# Sourdough Durable Object binding

A self-hostable implementation of the Cloudflare Durable Object API for Node.js
and, eventually, Nub.

> [!WARNING]
> This binding is a work in progress and has not been published to npm.

## Define the namespace on `env`

```typescript
import { defineEnv } from "@redwoodjs/sourdough";
import {
  durableObject,
  DurableObject,
  type DurableObjectNamespace,
} from "@redwoodjs/sourdough/durable-object";
import {
  nodeDurableObjects,
} from "@redwoodjs/sourdough/durable-object/node";

interface AppEnv {
  GREETING: string;
  COUNTERS: DurableObjectNamespace<Counter>;
}

class Counter extends DurableObject<AppEnv> {
  async increment() {
    const value = ((await this.ctx.storage.get<number>("value")) ?? 0) + 1;
    await this.ctx.storage.put("value", value);
    return value;
  }

  async fetch() {
    return new Response(String(await this.increment()));
  }
}

const actors = nodeDurableObjects();

export const env: AppEnv = defineEnv({
  GREETING: "hello",
  COUNTERS: durableObject({
    class: Counter,
    service: actors,
  }),
});
```

`nodeDurableObjects()` defaults to single-process execution with SQLite data
under:

```text
<cwd>/.sourdough/durable-object
```

Set an explicit provider-managed directory with `storageDir`:

```typescript
const actors = nodeDurableObjects({
  storageDir: "/var/lib/my-app/durable-objects",
});
```

## Application API

Application code receives a Cloudflare-compatible namespace:

```typescript
const id = env.COUNTERS.idFromName("global");
const counter = env.COUNTERS.get(id);

console.log(await counter.increment());
```

Fetch is also available on the stub:

```typescript
const response = await env.COUNTERS.getByName("global").fetch(
  "http://durable-object/",
);
```

The Node provider derives deterministic namespace-specific IDs, validates IDs,
serializes execution per object, passes the composed env into object instances,
and persists each object in a namespace-isolated SQLite database.

## Share one service across namespaces

```typescript
const actors = nodeDurableObjects();

export const env = defineEnv({
  COUNTERS: durableObject({
    class: Counter,
    service: actors,
  }),
  CHAT_ROOMS: durableObject({
    class: ChatRoom,
    service: actors,
  }),
});
```

One service coordinates both namespaces while keeping IDs, instances, and
storage isolated. Call `actors.close()` when using `defineEnv` without a runtime
host that manages provider shutdown.

## Low-level construction

`ClusterCoordinator` remains available for consumers that do not use
`defineEnv`:

```typescript
import {
  ClusterCoordinator,
  DurableObject,
} from "@redwoodjs/sourdough/durable-object";

class Counter extends DurableObject {
  async fetch() {
    return new Response("hello");
  }
}

const coordinator = new ClusterCoordinator();
const counter = await coordinator.get("counter-1", Counter);
const response = await counter.fetch(new Request("http://localhost"));
coordinator.close();
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

This binding module is experimental and partially compatible. Local namespace
RPC is implemented; multiprocess RPC capabilities and exact Cloudflare behavior
remain incomplete. See the support matrix for known gaps.
