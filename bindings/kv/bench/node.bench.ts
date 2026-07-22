import fs from "node:fs";
import path from "node:path";
import { afterAll, bench } from "vitest";

import { benchmarkOptions } from "../../../benchmarks/config.js";
import type { KVService } from "../src/service.js";
import { KVNamespace } from "../src/index.js";
import { createSQLiteKVNamespace } from "../src/providers/node/index.js";

const storageDir = path.join(process.cwd(), ".bench-storage", "kv");
fs.rmSync(storageDir, { recursive: true, force: true });

function namespace(name: string): KVNamespace {
  // Each benchmark bucket gets its own SQLite database file under <root>/kv.sqlite.
  return createSQLiteKVNamespace(path.join(storageDir, name));
}

// Seed fixtures once (1 KiB values) for the read/list benchmarks.
const getBucket = namespace("get");
await getBucket.put("hello", "w".repeat(64));

const listBucket = namespace("list-warm");
for (let index = 0; index < 100; index++) {
  await listBucket.put(`warm/${index.toString().padStart(3, "0")}`, new Uint8Array(1_024).fill(index % 97));
}

const putBucket = namespace("put");

// Adapter-only micro-path: KVNamespace over a stub service with no storage I/O.
function adapterOverStub(): KVNamespace {
  const stub: KVService = {
    async get() { return { value: null as unknown as Uint8Array, metadataRaw: "null" }; },
    put: async () => undefined,
    delete: async () => false,
    list: async () => ({ keys: [], list_complete: true }),
  };
  return new KVNamespace(stub);
}

let putIndex = 0;
bench("kv/adapter/get", async () => { await adapterOverStub().get("hello"); }, benchmarkOptions);

bench(
  "kv/node/put-1-kib",
  async () => {
    await putBucket.put(`put/${++putIndex}`, new Uint8Array(1_024).fill(7));
  },
  benchmarkOptions,
);

bench(
  "kv/node/get",
  async () => { void await getBucket.get("hello"); },
  benchmarkOptions,
);

bench(
  "kv/node/list-100",
  async () => { void (await listBucket.list({ prefix: "warm/", limit: 100 })); },
  benchmarkOptions,
);

afterAll(() => void fs.rmSync(storageDir, { recursive: true, force: true }));