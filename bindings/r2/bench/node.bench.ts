import fs from "node:fs";
import path from "node:path";
import { afterAll, bench } from "vitest";
import { benchmarkOptions } from "../../../benchmarks/config.js";
import { R2Bucket, type R2Service } from "../src/index.js";
import { createFileSystemR2Bucket } from "../src/providers/node/index.js";

const storageDir = path.join(process.cwd(), ".bench-storage", "r2");
fs.rmSync(storageDir, { recursive: true, force: true });

const readBucket = createFileSystemR2Bucket({
  root: path.join(storageDir, "read"),
});
const putBucket = createFileSystemR2Bucket({
  root: path.join(storageDir, "put"),
});
const listBucket = createFileSystemR2Bucket({
  root: path.join(storageDir, "list"),
});
const oneKiB = new Uint8Array(1_024).fill(42);
await readBucket.put("get-1-kib", oneKiB);
for (let index = 0; index < 100; index++) {
  await listBucket.put(`list/${index.toString().padStart(3, "0")}`, oneKiB);
}

const objectData = {
  key: "adapter-object",
  version: "version",
  size: 1_024,
  etag: "etag",
  uploaded: new Date(0),
};
const adapterBucket = new R2Bucket({
  async head() {
    return objectData;
  },
} as unknown as R2Service);

bench(
  "r2/adapter/head",
  async () => {
    await adapterBucket.head("adapter-object");
  },
  benchmarkOptions,
);

bench(
  "r2/node/head",
  async () => {
    await readBucket.head("get-1-kib");
  },
  benchmarkOptions,
);

bench(
  "r2/node/get-1-kib",
  async () => {
    const object = await readBucket.get("get-1-kib");
    await object!.arrayBuffer();
  },
  benchmarkOptions,
);

let putIndex = 0;
bench(
  "r2/node/put-1-kib",
  async () => {
    await putBucket.put(`put/${++putIndex}`, oneKiB);
  },
  benchmarkOptions,
);

bench(
  "r2/node/list-100",
  async () => {
    await listBucket.list({ prefix: "list/", limit: 100 });
  },
  benchmarkOptions,
);

afterAll(() => {
  fs.rmSync(storageDir, { recursive: true, force: true });
});
