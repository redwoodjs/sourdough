# Queue support matrix

- **Tier:** 0
- **Overall status:** Planned
- **Proposed subpath:** `@redwoodjs/sourdough/queue`

## Reference

- [Queues JavaScript APIs](https://developers.cloudflare.com/queues/configuration/javascript-apis/)

## Producer API

| Capability | Status | Compatibility target |
| --- | --- | --- |
| `send(body, options)` | Planned | Enqueue one message with content type and optional delay. |
| `sendBatch(messages, options)` | Planned | Enqueue an iterable of messages atomically where documented. |
| `metrics()` | Planned | Return backlog count, bytes, and oldest-message timestamp. |
| Content types | Planned | Support JSON, text, bytes, and V8 serialization modes. |
| Per-message delay | Planned | Delay delivery by `delaySeconds`. |

## Consumer API

| Capability | Status | Compatibility target |
| --- | --- | --- |
| Queue handler | Planned | Deliver a `MessageBatch` to the configured consumer. |
| `MessageBatch.queue` | Planned | Identify the source queue. |
| `MessageBatch.messages` | Planned | Expose messages in the delivered batch. |
| `ackAll()` | Planned | Acknowledge every message in the batch. |
| `retryAll(options)` | Planned | Retry every message, optionally after a delay. |
| Message metadata | Planned | Expose ID, timestamp, body, and attempt count. |
| `ack()` | Planned | Acknowledge one message. |
| `retry(options)` | Planned | Retry one message, optionally after a delay. |

## Delivery semantics

| Behavior | Status | Notes |
| --- | --- | --- |
| At-least-once delivery | Planned | Consumers must tolerate duplicate delivery. |
| Batch sizing and timeout | Planned | Honor configured batch limits. |
| Retry backoff | Planned | Apply explicit delays and configured retry policy. |
| Dead-letter queue | Planned | Route exhausted messages when configured. |
| Persistence across restart | Planned | Accepted messages survive process restarts. |
| Consumer concurrency | Planned | Enforce configured concurrent deliveries. |

The initial backend may be SQLite, but queue acknowledgement and retry semantics
must remain durable across host failures.
