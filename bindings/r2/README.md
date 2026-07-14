# Sourdough R2 binding

A work-in-progress Cloudflare-compatible R2 binding with a portable service
contract and a first-party Node.js filesystem provider.

> [!WARNING]
> Sourdough is experimental and has not been published to npm.

## Application API

Application code uses the Cloudflare-facing binding:

```typescript
import type { R2Bucket } from "@redwoodjs/sourdough/r2";

interface Env {
  BUCKET: R2Bucket;
}

export default {
  async fetch(request: Request, env: Env) {
    await env.BUCKET.put("hello.txt", "Hello from Sourdough");
    const object = await env.BUCKET.get("hello.txt");
    return new Response(object?.body);
  },
};
```

## Node.js filesystem provider

The runtime can construct a bucket with the first-party provider:

```typescript
import { createFileSystemR2Bucket } from "@redwoodjs/sourdough/r2/node";

const bucket = createFileSystemR2Bucket({
  root: "./data/my-bucket",
});
```

Object keys are hashed before becoming filesystem paths. Writes stream into an
immutable data file and atomically swap a metadata pointer, preventing path
traversal and partial replacement reads.

## Custom providers

Implement `R2Service` to adapt another object service:

```typescript
import type { R2Service } from "@redwoodjs/sourdough/r2";

class S3R2Service implements R2Service {
  // Implement the portable service contract using an S3 client.
}
```

The `R2Bucket` adapter remains responsible for Cloudflare-facing overloads,
input normalization, object wrappers, and error behavior. Providers remain
replaceable.

## Documentation

- [R2 support matrix](docs/support-matrix.md)
- [`env` composition and provider defaults](../../docs/env-composition.md)
- [Service adapter model](../../docs/service-adapter-model.md)
- [Repository-wide support matrix](../../docs/support-matrix.md)
