# Sourdough R2 binding

A work-in-progress Cloudflare-compatible R2 binding with a portable service
contract and a first-party Node.js filesystem provider.

> [!WARNING]
> Sourdough is experimental and has not been published to npm.

## Define the binding on `env`

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

The default filesystem location is derived from the binding name:

```text
<cwd>/.sourdough/r2/BUCKET
```

Use `storageDir` to select an explicit bucket directory:

```typescript
export const env = defineEnv({
  BUCKET: r2({
    service: fileSystem({
      storageDir: "/var/lib/my-app/uploads",
    }),
  }),
});
```

## Application API

Application code only sees the Cloudflare-facing `R2Bucket`:

```typescript
import { env } from "./env.js";

export default {
  async fetch() {
    await env.BUCKET.put("hello.txt", "Hello from Sourdough");
    const object = await env.BUCKET.get("hello.txt");
    return object
      ? new Response(object.body, { headers: { etag: object.httpEtag } })
      : new Response("Not found", { status: 404 });
  },
};
```

Object keys are hashed before becoming filesystem paths. Writes stream into an
immutable data file and atomically swap a metadata pointer, preventing path
traversal and partial replacement reads.

## Low-level construction

Consumers that do not use `defineEnv` can construct a bucket directly:

```typescript
import { createFileSystemR2Bucket } from "@redwoodjs/sourdough/r2/node";

const bucket = createFileSystemR2Bucket({
  root: "./data/my-bucket",
});
```

## Custom providers

Implement `R2Service` to adapt another object service and pass the instance to
`r2()`:

```typescript
import { defineEnv } from "@redwoodjs/sourdough";
import { r2, type R2Service } from "@redwoodjs/sourdough/r2";

class S3R2Service implements R2Service {
  // Implement the portable service contract using an S3 client.
}

export const env = defineEnv({
  BUCKET: r2({
    service: new S3R2Service(),
  }),
});
```

The `R2Bucket` adapter remains responsible for Cloudflare-facing overloads,
input normalization, object wrappers, and error behavior. Providers remain
replaceable.

## Documentation

- [R2 support matrix](docs/support-matrix.md)
- [`env` composition and provider defaults](../../docs/env-composition.md)
- [Service adapter model](../../docs/service-adapter-model.md)
- [Repository-wide support matrix](../../docs/support-matrix.md)
