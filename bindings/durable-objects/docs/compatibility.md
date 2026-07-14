# Durable Object compatibility

**Overall status: Partial**

This document tracks the API and behavioral compatibility of
`@redwoodjs/sourdough/durable-objects` with Cloudflare's Durable Object API. The
public base class is named `DurableObject` so compatible application code does
not need a Sourdough-specific class name.

## References

- [Durable Object base class](https://developers.cloudflare.com/durable-objects/api/base/)
- [Durable Object state](https://developers.cloudflare.com/durable-objects/api/state/)
- [Durable Object namespace](https://developers.cloudflare.com/durable-objects/api/namespace/)
- [Durable Object stub](https://developers.cloudflare.com/durable-objects/api/stub/)
- [Key-value storage](https://developers.cloudflare.com/durable-objects/api/kv-storage/)
- [SQLite storage](https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/)
- [Alarms](https://developers.cloudflare.com/durable-objects/api/alarms/)
- [WebSockets](https://developers.cloudflare.com/durable-objects/best-practices/websockets/)
- [Workers RPC](https://developers.cloudflare.com/workers/runtime-apis/rpc/)

## Coverage

| Area | Status | Current coverage |
| --- | --- | --- |
| `DurableObject` base class | Partial | Compatible constructor shape, `ctx`, `env`, `fetch`, `alarm`, and WebSocket handler hooks. |
| Namespace and IDs | Partial | `idFromName`, `idFromString`, and `get` are available through `serve()`, but IDs currently use simplified string semantics. |
| Stubs and routing | Partial | Fetch routing works locally and over Unix domain sockets. Full RPC capability semantics are not implemented. |
| Key-value storage | Partial | `get`, `put`, `delete`, `deleteAll`, `list`, and `transaction` are implemented with SQLite or memory storage. Options and transaction semantics need conformance work. |
| SQLite storage | Partial | Per-object SQLite databases and basic prepared statements are implemented. The public SQL cursor API is not yet fully compatible. |
| Concurrency | Partial | Requests are serialized per object and `blockConcurrencyWhile` is implemented. Input/output gate semantics need conformance tests. |
| `waitUntil` | Partial | Background promises are tracked during an object's lifetime. Runtime shutdown and failure behavior are not fully compatible. |
| Alarms | Partial | `getAlarm`, `setAlarm`, `deleteAlarm`, and `alarm` dispatch are implemented. Scheduling and retry semantics remain incomplete. |
| WebSockets | Partial | Socket tracking, tags, event handlers, broadcasting, and hibernation are implemented. Runtime-level WebSocket compatibility remains incomplete. |
| Hibernation | Partial | Idle instances can be evicted and recreated while state remains persistent. |
| Placement and durability | Partial | Single-machine, multi-process placement is available. Global placement, replication, and failure recovery are not implemented. |

## Base class

```typescript
import { DurableObject } from "@redwoodjs/sourdough/durable-objects";

interface Env {
  GREETING: string;
}

export class Counter extends DurableObject<Env> {
  async fetch() {
    const value = ((await this.ctx.storage.get<number>("value")) ?? 0) + 1;
    await this.ctx.storage.put("value", value);
    return new Response(`${this.env.GREETING} ${value}`);
  }
}
```

## Implemented storage surface

### Key-value storage

- `get(key)` and `get(keys)`
- `put(key, value)` and `put(entries)`
- `delete(key)` and `delete(keys)`
- `deleteAll()`
- `list({ start, startAfter, end, prefix, reverse, limit })`
- `transaction(callback)`
- `sync()`

### Alarms

- `getAlarm()`
- `setAlarm(time)`
- `deleteAlarm()`
- `alarm()` handler dispatch

### Current SQL surface

- `sql.prepare(query)`
- `sql.exec(query)`
- `sql.databaseSize`
- statement `bind`, `first`, `all`, and `run`

The SQL surface above reflects the current implementation. It must be reshaped
where necessary to match Cloudflare's SQLite cursor API before this area can be
marked supported.

## Important known gaps

1. Durable Object IDs are strings rather than fully compatible
   `DurableObjectId` values.
2. Namespace jurisdiction, location hints, and stub options are missing.
3. Storage options, transaction behavior, durability guarantees, and error
   behavior do not yet have conformance coverage.
4. SQLite cursors and several SQL metadata properties are missing.
5. Workers RPC capability lifetime and serialization behavior are incomplete.
6. WebSocket upgrade and hibernation behavior still depend on host-runtime
   adapters.
7. The host pool provides single-machine placement, not Cloudflare's global
   placement and replication model.

This matrix should remain conservative. A row moves to **Supported** only after
compatibility tests cover the documented API and its important runtime
semantics.
