# Binding package architecture

Sourdough is a catalog of bindings, not a monolithic runtime. Applications
should be able to pick one binding without installing unrelated services.

## Directory convention

Each binding lives at `bindings/<binding-name>/` and owns:

```text
bindings/<binding-name>/
  package.json
  README.md
  docs/
    compatibility.md
  src/
  tsconfig.json
  vitest.config.ts
```

A binding package must:

1. expose the same public API names as the Cloudflare binding where practical;
2. document supported and missing API surface in `docs/compatibility.md`;
3. run and test independently;
4. avoid dependencies on unrelated bindings;
5. keep storage and transport adapters behind the binding's public API; and
6. add or update its row in `docs/support-matrix.md`.

## Package names

Binding packages use `@redwoodjs/sourdough-<binding-name>`. For example, the
Durable Object implementation is published as
`@redwoodjs/sourdough-durable-object`.

## Shared code

Code should stay in its binding until at least two bindings need it. Reusable
runtime primitives can then move to a focused package under `packages/`.
Bindings may depend on those primitives, but the shared package must not import
specific bindings.

## Status definitions

- **Supported**: the documented API is compatible enough for normal use and is
  covered by conformance tests.
- **Partial**: an implementation exists, but documented behavior or API surface
  is still missing.
- **Planned**: no implementation exists yet.

The support matrix should be conservative: unsupported behavior remains listed
as missing until a compatibility test proves it works.
