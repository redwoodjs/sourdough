# Binding module architecture

Sourdough is a single package with one primary public subpath export per
binding. Runtime-specific provider factories use a nested subpath such as
`/r2/node` or `/durable-object/node`. An application installs
`@redwoodjs/sourdough`, then imports only the binding modules it needs. Each module follows the
[service adapter model](service-adapter-model.md): a Cloudflare-compatible API
adapts a portable service contract implemented by one or more providers. The
[`env` composition model](env-composition.md) defines how applications name and
wire those pieces together.

```typescript
import { DurableObject } from "@redwoodjs/sourdough/durable-object";
```

## Directory convention

Each binding lives at `bindings/<binding-name>/` and owns:

```text
bindings/<binding-name>/
  README.md
  docs/
    support-matrix.md
  src/
```

The root `package.json` maps each binding directory to a public export:

```json
{
  "exports": {
    "./durable-object": {
      "types": "./dist/bindings/durable-object/src/index.d.ts",
      "import": "./dist/bindings/durable-object/src/index.js"
    },
    "./durable-object/node": {
      "types": "./dist/bindings/durable-object/src/providers/node/index.d.ts",
      "import": "./dist/bindings/durable-object/src/providers/node/index.js"
    }
  }
}
```

A binding module must:

1. expose the same public API names as the Cloudflare binding where practical;
2. document supported and missing API surface in `docs/support-matrix.md`;
3. define a backend-independent service contract for providers;
4. keep runtime and provider details behind the binding adapter;
5. avoid importing unrelated binding modules;
6. export its public surface from its own `src/index.ts`;
7. have a root-package subpath export; and
8. add or update its row in `docs/support-matrix.md`.

## Internal boundaries

A subpath import must not initialize unrelated bindings. Shared code should stay
inside a binding until at least two bindings need it, then move into an internal
root module. Shared modules must not import specific bindings.

Some dependencies may be installed with the root package, but binding-specific
code and side effects remain behind the binding's subpath export.

## Status definitions

- **Supported**: the documented API is compatible enough for normal use and is
  covered by conformance tests.
- **Partial**: an implementation exists, but documented behavior or API surface
  is still missing.
- **Planned**: no implementation exists yet.

The support matrix should be conservative: unsupported behavior remains listed
as missing until a compatibility test proves it works.
