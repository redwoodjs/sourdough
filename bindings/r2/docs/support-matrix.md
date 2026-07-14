# R2 support matrix

- **Tier:** 0
- **Overall status:** Planned
- **Proposed subpath:** `@redwoodjs/sourdough/r2`

## Reference

- [R2 Workers API](https://developers.cloudflare.com/r2/api/workers/workers-api-reference/)

## Bucket API

| Capability | Status | Compatibility target |
| --- | --- | --- |
| `head(key)` | Planned | Return object metadata without a body. |
| `get(key, options)` | Planned | Return metadata and a streamed body, including ranges and conditions. |
| `put(key, value, options)` | Planned | Accept streams, buffers, strings, blobs, and null values. |
| `delete(key)` | Planned | Delete one object. |
| `delete(keys)` | Planned | Delete multiple objects. |
| `list(options)` | Planned | Support limit, prefix, cursor, delimiter, and include options. |
| `createMultipartUpload` | Planned | Start a multipart upload with metadata. |
| `resumeMultipartUpload` | Planned | Resume an upload by ID. |

## Object and multipart types

| Capability | Status | Compatibility target |
| --- | --- | --- |
| `R2Object` metadata | Planned | Key, version, size, ETags, upload time, range, and storage class. |
| HTTP metadata | Planned | Read, write, and apply standard content headers. |
| Custom metadata | Planned | Preserve string metadata. |
| Checksums | Planned | MD5 and SHA family checksum fields and validation. |
| `R2ObjectBody` readers | Planned | `arrayBuffer`, `text`, `json`, `blob`, body stream, and `bodyUsed`. |
| Multipart part upload | Planned | Upload numbered parts and return ETags. |
| Multipart complete/abort | Planned | Atomically complete or abort an upload. |

## Runtime semantics

| Behavior | Status | Notes |
| --- | --- | --- |
| Conditional operations | Planned | Match ETag and upload-date preconditions. |
| Range reads | Planned | Support offset, length, and suffix forms. |
| Streaming and backpressure | Planned | Do not buffer entire large objects by default. |
| Atomic object replacement | Planned | Readers observe either the old or new object. |
| Bucket isolation | Planned | Keep buckets and applications isolated. |

The first adapter can target the local filesystem or S3-compatible storage, but
adapter details must not leak into the R2-facing API.
