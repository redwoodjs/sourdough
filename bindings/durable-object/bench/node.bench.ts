import fs from "node:fs";
import path from "node:path";
import { afterAll, bench } from "vitest";
import { benchmarkOptions } from "../../../benchmarks/config.js";
import { defineEnv } from "../../../src/env.js";
import {
  ClusterCoordinator,
  durableObject,
  DurableObject,
  route,
} from "../src/index.js";
import { nodeDurableObjects } from "../src/providers/node/index.js";

const storageDir = path.join(process.cwd(), ".bench-storage", "durable-object");
fs.rmSync(storageDir, { recursive: true, force: true });

class BenchmarkObject extends DurableObject {
  async noop(): Promise<void> {}

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/kv") {
      await this.storage.put("foo", "bar");
      await this.storage.get("foo");
    } else if (url.pathname === "/sql") {
      this.storage.sql.exec(
        "CREATE TABLE IF NOT EXISTS bench (id INTEGER PRIMARY KEY)",
      );
      this.storage.sql.exec("INSERT INTO bench DEFAULT VALUES");
    }
    return new Response("OK");
  }
}

const coordinator = new ClusterCoordinator({
  storageDir: path.join(storageDir, "coordinator"),
});
const actors = nodeDurableObjects({
  storageDir: path.join(storageDir, "env"),
});
const env = defineEnv({
  OBJECTS: durableObject({
    class: BenchmarkObject,
    service: actors,
  }),
});

const cachedId = "cached-instance";
await coordinator.get(cachedId, BenchmarkObject);
const activationCoordinator = new ClusterCoordinator();
let newIdCounter = 0;

bench(
  "durable-object/node/coordinator-get-cached",
  async () => {
    await coordinator.get(cachedId, BenchmarkObject);
  },
  benchmarkOptions,
);

bench(
  "durable-object/node/coordinator-activate-in-memory",
  async () => {
    await activationCoordinator.get(`new-${++newIdCounter}`, BenchmarkObject);
    activationCoordinator.close();
  },
  benchmarkOptions,
);

const noOpInstance = await coordinator.get("noop-instance", BenchmarkObject);
const noOpRequest = new Request("http://localhost/");
bench(
  "durable-object/node/fetch-noop",
  async () => {
    await noOpInstance.fetch(noOpRequest);
  },
  benchmarkOptions,
);

const kvInstance = await coordinator.get("kv-instance", BenchmarkObject);
const kvRequest = new Request("http://localhost/kv");
bench(
  "durable-object/node/storage-kv-roundtrip",
  async () => {
    await kvInstance.fetch(kvRequest);
  },
  benchmarkOptions,
);

const sqlInstance = await coordinator.get("sql-instance", BenchmarkObject);
const sqlRequest = new Request("http://localhost/sql");
bench(
  "durable-object/node/storage-sql-write",
  async () => {
    await sqlInstance.fetch(sqlRequest);
  },
  benchmarkOptions,
);

const listInstance = await coordinator.get("list-instance", BenchmarkObject);
const listEntries: Record<string, string> = {};
for (let index = 0; index < 100; index++) {
  listEntries[`key-${index.toString().padStart(3, "0")}`] = `value-${index}`;
}
await listInstance.storage.put(listEntries);
bench(
  "durable-object/node/storage-list-100",
  async () => {
    await listInstance.storage.list({ limit: 100 });
  },
  benchmarkOptions,
);

const router = route(coordinator, BenchmarkObject, request =>
  new URL(request.url).searchParams.get("id"),
);
const routerTargetId = "router-target";
await coordinator.get(routerTargetId, BenchmarkObject);
const routerRequest = new Request(
  `http://localhost/?id=${routerTargetId}`,
);
bench(
  "durable-object/node/router-dispatch",
  async () => {
    await router(routerRequest);
  },
  benchmarkOptions,
);

bench(
  "durable-object/adapter/id-from-name",
  () => {
    env.OBJECTS.idFromName("global");
  },
  benchmarkOptions,
);

const stub = env.OBJECTS.getByName("global");
await stub.noop();
bench(
  "durable-object/node/rpc-noop",
  async () => {
    await stub.noop();
  },
  benchmarkOptions,
);

afterAll(() => {
  coordinator.close();
  activationCoordinator.close();
  actors.close();
  fs.rmSync(storageDir, { recursive: true, force: true });
});
