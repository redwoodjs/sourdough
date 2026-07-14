# Benchmarks

Sourdough treats performance as a compatibility property. Every pull request
runs its proposed commit and base commit on the same worker, compares the
results, and publishes the complete comparison to
[`redwoodjs/sourdough-benchmarks`](https://github.com/redwoodjs/sourdough-benchmarks).

## Binding convention

Place benchmarks under the binding that owns them:

```text
bindings/<binding>/bench/adapter.bench.ts
bindings/<binding>/bench/node.bench.ts
bindings/<binding>/bench/scenarios.bench.ts
```

Use the shared timing options:

```typescript
import { bench } from "vitest";
import { benchmarkOptions } from "../../../benchmarks/config.js";

bench(
  "r2/node/get-1-kib",
  async () => {
    // One measured operation.
  },
  benchmarkOptions,
);
```

Names are public, permanent result identifiers. They must be globally unique
and use this shape:

```text
<binding>/<layer>/<operation>[-<fixture>]
```

A binding should cover three layers where applicable:

1. **Adapter** — normalization and Cloudflare-facing wrapper overhead.
2. **Provider** — a concrete filesystem, SQLite, network, or custom provider.
3. **Scenario** — a representative sequence crossing multiple layers.

Fixtures must be deterministic. Setup and cleanup stay outside measured
callbacks. Local files belong under `.bench-storage` and must be removed with an
`afterAll` hook. Network benchmarks require a dedicated scenario suite and must
not be mixed with local microbenchmarks.

## Run locally

```bash
pnpm bench
```

Shorten a diagnostic run without changing committed policy:

```bash
SOURDOUGH_BENCH_TIME=250 pnpm bench
```

Compare two already-installed worktrees:

```bash
node benchmarks/run-comparison.mjs \
  --base /path/to/base \
  --head /path/to/head \
  --output /tmp/sourdough-benchmarks/result.json
```

The comparison alternates execution order. With the default two rounds per
commit it runs `base → head → head → base`.

## Regression policy

[`thresholds.json`](thresholds.json) contains the default maximum latency
increase and narrowly scoped overrides for noisy operations.

A result fails when:

- median latency exceeds the configured percentage; and
- every head round is slower than every base round.

An over-threshold result with overlapping ranges is recorded as a warning. A
removed benchmark fails so performance coverage cannot disappear accidentally.
A newly added benchmark is recorded without failing because it has no baseline.

Threshold changes are ordinary source changes and should explain why a
benchmark needs different noise tolerance. They must not be used to hide an
application regression.

## Result publication and security

The pull-request workflow has no credential for the result repository. It only
uploads JSON as a GitHub Actions artifact and sets the required check. A
`workflow_run` workflow running trusted `main` code validates the artifact and
publishes it with a deploy key that can write only to the result repository.
Pull request code is never executed in the credentialed workflow.
