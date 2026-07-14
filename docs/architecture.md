# Binding module architecture

Sourdough is a single package with one public subpath export per binding. An
application installs `@redwoodjs/sourdough`, then imports only the binding
modules it needs:

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
    }
  }
}
```

A binding module must:

1. expose the same public API names as the Cloudflare binding where practical;
2. document supported and missing API surface in `docs/support-matrix.md`;
3. avoid importing unrelated binding modules;
4. keep storage and transport adapters behind the binding's public API;
5. export its public surface from its own `src/index.ts`;
6. have a root-package subpath export; and
7. add or update its row in `docs/support-matrix.md`.

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
