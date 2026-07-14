# Service binding support matrix

- **Tier:** 0
- **Overall status:** Planned
- **Proposed subpath:** `@redwoodjs/sourdough/service-binding`

Service bindings connect separately deployed Worker-style services without a
public network hop. Tier 0 includes both HTTP-style calls and the core RPC
model needed to compose applications.

## References

- [Service bindings](https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/)
- [Service binding HTTP interface](https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/http/)
- [Workers RPC](https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/rpc/)

## API surface

| Capability | Status | Compatibility target |
| --- | --- | --- |
| `Fetcher.fetch(request)` | Planned | Dispatch a standard `Request` to the target service. |
| `fetch(url, init)` convenience form | Planned | Match the Workers fetcher overloads. |
| Public RPC methods | Planned | Call methods exposed by a `WorkerEntrypoint`. |
| Named entrypoints | Planned | Select a named service entrypoint from configuration. |
| Entrypoint `env`, `ctx`, and `props` | Planned | Construct entrypoints with compatible request context. |
| Structured-clone values | Planned | Transfer supported JavaScript values across the boundary. |
| RPC targets and capabilities | Planned | Preserve callable object references for their valid lifetime. |

## Runtime semantics

| Behavior | Status | Notes |
| --- | --- | --- |
| In-process transport | Planned | Allow isolated services in one host without an HTTP socket. |
| Cross-process transport | Planned | Route calls between host processes transparently. |
| Exception propagation | Planned | Preserve useful error names, messages, and remote context. |
| Request context propagation | Planned | Propagate cancellation and request lifetime. |
| Service isolation | Planned | Keep globals, bindings, and failures isolated per service. |
| Loop and depth limits | Planned | Prevent unbounded recursive service-binding calls. |

Smart Placement is infrastructure-specific and is not required for initial
Tier 0 compatibility.
