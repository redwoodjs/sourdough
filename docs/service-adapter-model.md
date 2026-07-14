# Service adapter model

Sourdough is a Cloudflare compatibility layer over pluggable service
implementations. It is not one fixed reimplementation of every Cloudflare
service.

The first-party implementation targets Node.js 24 and Nub, but the binding and
service contracts must allow other runtimes and backends.

## Three kinds of portability

Sourdough separates three concerns:

1. **API compatibility** — application code sees Cloudflare-compatible binding
   APIs such as `KVNamespace`, `R2Bucket`, `D1Database`, and `DurableObject`.
2. **Provider portability** — a binding delegates its work to a service
   implementation backed by SQLite, Redis, S3, Postgres, an HTTP service, or
   another suitable system.
3. **Runtime portability** — Node.js 24 and Nub host the application, construct
   bindings, provide request context, and manage lifecycle.

Node.js and Nub are runtime hosts. They are not storage or queue backends.

```text
Application code
      │
      ▼
Cloudflare-compatible binding API
      │
      ▼
Sourdough binding adapter
      │
      ▼
Portable service contract
      │
      ▼
Provider implementation
      │
      ▼
SQLite / Redis / S3 / Postgres / remote service / custom backend

The Node.js or Nub runtime wires these layers together and supplies lifecycle,
configuration, isolation, and request context.
```

## Terminology

### Binding API

The public interface used by application code. This should use Cloudflare's
names, method signatures, return values, and error behavior wherever practical.
Backend-specific methods do not belong here.

### Binding adapter

The Sourdough implementation of the public binding API. It validates and
normalizes inputs, calls the service contract, and converts provider results and
errors into Cloudflare-compatible behavior.

### Service contract

A backend-independent interface describing what the adapter needs from a
service implementation. It is a provider-facing SPI, not the application-facing
Cloudflare API.

### Provider

An implementation of a service contract. A provider may be first-party or
third-party and may use a local library, another process, or a remote service.

### Runtime host

The environment that executes application code and assembles bindings. Node.js
24 is the first runtime; Nub is also a primary target. Other runtimes should be
possible without redesigning each binding API.

## KV example

Application code only sees the Cloudflare-compatible API:

```typescript
const value = await env.KV.get("greeting");
await env.KV.put("greeting", "hello", { expirationTtl: 60 });
```

Internally, the adapter can depend on a portable contract:

```typescript
interface KVService {
  get(key: string): Promise<KVServiceValue | null>;
  put(key: string, value: KVServiceValue, options: KVServicePutOptions): Promise<void>;
  delete(key: string): Promise<void>;
  list(options: KVServiceListOptions): Promise<KVServiceListResult>;
}
```

Multiple providers can satisfy that contract:

```typescript
class SQLiteKVService implements KVService {}
class RedisKVService implements KVService {}
class RemoteKVService implements KVService {}
```

The binding adapter remains responsible for Cloudflare-specific overloads,
value decoding, metadata shapes, expiration behavior, pagination, and errors.
An application's `env.KV` API does not change when the provider changes.

## Responsibility boundaries

| Layer | Responsibilities |
| --- | --- |
| Binding API | Cloudflare-compatible public names and types. |
| Binding adapter | Validation, overloads, result conversion, errors, and compatibility semantics. |
| Service contract | Smallest backend-neutral capability set needed by the adapter. |
| Provider | Persistence, transport, transactions, retries, streaming, and backend resource management. |
| Runtime host | Configuration, provider construction, `env` wiring, lifecycle, isolation, and request context. |

## Semantic compatibility

Matching method names is not enough. Adapters and providers together must
preserve observable Cloudflare behavior, including consistency, ordering,
expiration, retries, transactions, streaming, error shapes, and isolation.

A provider may have stronger guarantees than Cloudflare, but the public binding
must not accidentally promise provider-specific behavior. A provider with
weaker guarantees must emulate the required behavior or report that it cannot
satisfy the contract.

Examples:

- A strongly consistent SQLite KV provider must not make global strong
  consistency part of Sourdough's KV API contract.
- An S3-backed R2 provider must translate S3 metadata, ETags, ranges, and
  multipart behavior into R2-compatible results.
- A SQLite queue provider must preserve acknowledgement, retry, and at-least-once
  delivery semantics across process restarts.
- A Postgres-backed D1 provider must still expose D1's SQLite-oriented types,
  result objects, and transaction behavior.

## Provider requirements

A provider must:

1. implement the binding's service contract without exposing its client library
   through the public binding;
2. declare unsupported capabilities explicitly;
3. isolate resources by application, environment, and binding instance;
4. support clean startup and shutdown through the runtime lifecycle;
5. avoid global state that prevents multiple provider instances;
6. preserve cancellation and backpressure where the contract supports them;
   and
7. pass the binding's provider conformance suite.

Third parties should be able to implement a provider without importing runtime
internals. Provider contracts therefore need to be documented, versioned, and
exported intentionally once they are stable.

## Testing model

Each binding needs three test layers:

1. **API compatibility tests** exercise the public binding as application code
   would and compare behavior with the support matrix.
2. **Service contract tests** define the behavior every provider must satisfy.
3. **Provider tests** run the shared contract suite plus backend-specific failure
   and lifecycle tests.

The same API compatibility suite should run against every supported provider.
A binding is only marked **Supported** when its public API and at least one
first-party provider satisfy the documented compatibility target.

## Design rules

- Cloudflare-compatible APIs face applications; service contracts face
  providers.
- Runtime-specific code must not appear in service contracts.
- Provider-specific features must not leak into the Cloudflare-facing API.
- Binding adapters must not choose a global provider implicitly.
- Runtime configuration selects and constructs providers explicitly.
- Shared provider contracts should use Web Platform types where possible.
- First-party Node.js and Nub providers establish the reference behavior, not a
  permanent runtime limitation.

## Relationship to support matrices

A binding's support matrix defines the public compatibility target. Provider
support is a separate dimension and should eventually be documented as a list
of providers and the capabilities each one passes.

This distinction lets Sourdough say both:

- “The KV binding supports this part of the Cloudflare API.”
- “The SQLite and Redis providers pass this part of the KV service contract.”
