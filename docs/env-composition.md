# `env` composition

> [!NOTE]
> `defineEnv`, the R2 binding descriptor, and the Node.js filesystem provider
> are implemented. Durable Object composition and automatic injection into
> Worker-style handler arguments remain design targets.

Sourdough uses `env` as the composition root for application bindings. An env
definition connects three things:

1. the name application code uses, such as `BUCKET` or `COUNTERS`;
2. the Cloudflare-compatible binding adapter, such as R2 or Durable Object; and
3. the service provider that implements the binding.

The resulting `env` exposes only Cloudflare-compatible binding objects. Provider
clients and configuration remain private.

```text
env.BUCKET
    │
    ▼
R2Bucket API
    │
    ▼
R2 binding adapter
    │
    ▼
R2Service
    │
    ▼
Node filesystem provider
```

## General shape

```typescript
import { defineEnv } from "@redwoodjs/sourdough";

export const env = defineEnv({
  BINDING_NAME: binding({
    service: provider(),
  }),
});
```

The binding name is available to the provider during construction. This allows
a provider to derive isolated default storage without requiring the user to
repeat the name.

Service selection is explicit. A generic binding such as `r2()` must not
silently import a Node.js or Nub implementation.

## R2 with the Node.js provider

The recommended Node.js service is the filesystem provider:

```typescript
import { defineEnv } from "@redwoodjs/sourdough";
import { r2 } from "@redwoodjs/sourdough/r2";
import { fileSystem } from "@redwoodjs/sourdough/r2/node";

export const env = defineEnv({
  BUCKET: r2({
    service: fileSystem(),
  }),
});
```

`fileSystem()` derives its default storage directory from the binding name:

```text
<cwd>/.sourdough/r2/BUCKET
```

R2 must not default to an in-memory provider. Silently losing object data after
a restart would be surprising and incompatible with the service model.

### Explicit R2 storage directory

```typescript
export const env = defineEnv({
  BUCKET: r2({
    service: fileSystem({
      storageDir: "/var/lib/my-app/uploads",
    }),
  }),
});
```

### Multiple R2 bindings

```typescript
export const env = defineEnv({
  UPLOADS: r2({
    service: fileSystem(),
  }),

  ARCHIVE: r2({
    service: fileSystem({
      storageDir: "/mnt/archive",
    }),
  }),
});
```

The default directories are isolated:

```text
<cwd>/.sourdough/r2/UPLOADS
/mnt/archive
```

### Custom R2 provider

```typescript
import { s3 } from "@example/sourdough-r2-s3";

export const env = defineEnv({
  BUCKET: r2({
    service: s3({
      endpoint: "https://s3.example.com",
      bucket: "uploads",
    }),
  }),
});
```

Application code continues to use `env.BUCKET` as an `R2Bucket`; it cannot tell
which provider is underneath.

## Durable Objects

A Durable Object binding has one extra input: the application class associated
with the namespace. The service manages placement, persistence, execution, and
lifecycle for all instances of that class.

```typescript
import { defineEnv } from "@redwoodjs/sourdough";
import {
  durableObject,
  DurableObject,
} from "@redwoodjs/sourdough/durable-object";
import {
  nodeDurableObjects,
} from "@redwoodjs/sourdough/durable-object/node";

class Counter extends DurableObject {
  async increment() {
    const value = ((await this.ctx.storage.get<number>("value")) ?? 0) + 1;
    await this.ctx.storage.put("value", value);
    return value;
  }
}

const actors = nodeDurableObjects();

export const env = defineEnv({
  COUNTERS: durableObject({
    class: Counter,
    service: actors,
  }),
});
```

Application code uses the Cloudflare namespace and stub APIs:

```typescript
const id = env.COUNTERS.idFromName("global");
const counter = env.COUNTERS.get(id);

console.log(await counter.increment());
```

### Sharing one Durable Object service

Multiple namespaces should normally share one host service. This allows one
provider to coordinate process placement and lifecycle while preserving class,
namespace, and storage isolation.

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

The binding name identifies the namespace. The class identifies the application
implementation. The shared `actors` value is the replaceable service provider.

## Durable Object Node.js defaults

`nodeDurableObjects()` should default to:

- single-process execution;
- SQLite persistence;
- serialized execution per object;
- alarms, hibernation, and RPC enabled; and
- storage under `<cwd>/.sourdough/durable-object`.

The default remains explicit because application code must select
`nodeDurableObjects()` as its service. The generic `durableObject()` binding does
not select Node.js automatically.

### Explicit Durable Object storage directory

The option should be named `storageDir`, not `root`:

```typescript
const actors = nodeDurableObjects({
  storageDir: "/var/lib/my-app/durable-objects",
});
```

`storageDir` is a provider-managed data directory. It is not a URL, project
root, or public application path. Relative paths resolve from `process.cwd()`.

An illustrative internal layout is:

```text
.sourdough/durable-object/
  COUNTERS/
    <object-id>.sqlite
  CHAT_ROOMS/
    <object-id>.sqlite
```

The layout is not public API. Applications must not open, move, or depend on
provider files directly.

### Multiprocess Durable Object hosting

Single-process operation is the safe default. Process isolation and parallelism
are explicit:

```typescript
const actors = nodeDurableObjects({
  storageDir: "/var/lib/my-app/durable-objects",
  hostCount: 4,
});
```

A Nub or remote provider changes only the service selection. Namespace use in
application code remains unchanged.

## Global and request `env`

The exported global env and the env supplied to a Worker-style handler expose
the same binding objects:

```typescript
import { env } from "./env.js";

export type Env = typeof env;

export default {
  async fetch(request: Request, requestEnv: Env) {
    // Both expressions refer to the same configured binding.
    console.assert(requestEnv.BUCKET === env.BUCKET);

    const object = await requestEnv.BUCKET.get("hello.txt");
    return object
      ? new Response(object.body, { headers: { etag: object.httpEtag } })
      : new Response("Not found", { status: 404 });
  },
};
```

`defineEnv` should preserve inferred binding types, keep binding names stable,
and make provider lifecycle available to the runtime without exposing lifecycle
methods on Cloudflare-facing binding objects.

## Defaults and overrides

- A binding always requires a service selection.
- First-party Node.js provider factories may provide safe, persistent defaults.
- Persistent bindings must not silently select in-memory storage.
- Default local paths live under `<cwd>/.sourdough/<binding>/<name>`.
- Explicit provider options override derived paths.
- Remote providers use their own endpoint or client configuration and do not
  receive irrelevant local `storageDir` options.
- Provider configuration never appears on the resulting `env` binding.

This model keeps application code Cloudflare-compatible while making runtime and
service implementations explicit and replaceable.
