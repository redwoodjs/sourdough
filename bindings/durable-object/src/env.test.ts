import { rm } from "node:fs/promises";
import path from "node:path";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  expectTypeOf,
  it,
} from "vitest";
import { defineEnv } from "../../../src/env.js";
import {
  durableObject,
  DurableObject,
  DurableObjectNamespace,
} from "./index.js";
import { nodeDurableObjects } from "./providers/node/index.js";

class Counter extends DurableObject<{ GREETING: string }> {
  async increment(): Promise<number> {
    const count = ((await this.storage.get<number>("count")) ?? 0) + 1;
    await this.storage.put("count", count);
    return count;
  }

  greeting(): string {
    return this.env.GREETING;
  }

  async fail(): Promise<never> {
    throw new Error("expected failure");
  }

  async fetch(): Promise<Response> {
    return new Response(String((await this.storage.get<number>("count")) ?? 0));
  }
}

class Room extends DurableObject {
  async fetch(): Promise<Response> {
    return new Response("room");
  }
}

const defaultStorageDir = path.resolve(
  ".sourdough",
  "durable-object",
  "DEFAULT_COUNTERS",
);

describe("Durable Object env composition", () => {
  beforeEach(async () => {
    await rm(defaultStorageDir, { recursive: true, force: true });
  });

  afterEach(async () => {
    await rm(defaultStorageDir, { recursive: true, force: true });
  });

  it("surfaces a typed namespace with RPC, fetch, persistence, and env", async () => {
    const storageDir = path.resolve(".test-storage-do-env");
    const actors = nodeDurableObjects({ storageDir });
    try {
      const env = defineEnv({
        COUNTERS: durableObject({
          class: Counter,
          service: actors,
        }),
        GREETING: "hello",
      });

      expectTypeOf(env.COUNTERS).toEqualTypeOf<
        DurableObjectNamespace<Counter>
      >();
      const id = env.COUNTERS.idFromName("global");
      expect(id.toString()).toMatch(/^[a-f\d]{64}$/);
      expect(id.name).toBe("global");
      expect(env.COUNTERS.idFromName("global").equals(id)).toBe(true);
      expect(env.COUNTERS.idFromString(id.toString()).equals(id)).toBe(true);

      const counter = env.COUNTERS.get(id);
      expect(await Promise.all([counter.increment(), counter.increment()])).toEqual([
        1, 2,
      ]);
      expect(await counter.greeting()).toBe("hello");
      await expect(counter.fail()).rejects.toThrow("expected failure");
      expect(await counter.increment()).toBe(3);
      expect(await (await counter.fetch("http://example.com")).text()).toBe("3");
    } finally {
      actors.close();
      await rm(storageDir, { recursive: true, force: true });
    }
  });

  it("shares a service while isolating namespaces", async () => {
    const storageDir = path.resolve(".test-storage-do-namespaces");
    const actors = nodeDurableObjects({ storageDir });
    try {
      const env = defineEnv({
        COUNTERS: durableObject({ class: Counter, service: actors }),
        ROOMS: durableObject({ class: Room, service: actors }),
      });

      const counterId = env.COUNTERS.idFromName("global");
      expect(env.ROOMS.idFromName("global").toString()).not.toBe(
        counterId.toString(),
      );
      expect(() => env.ROOMS.get(counterId)).toThrow(
        "does not belong to namespace ROOMS",
      );
      expect(() => env.ROOMS.idFromString(counterId.toString())).toThrow(
        "belongs to a different namespace",
      );
    } finally {
      actors.close();
      await rm(storageDir, { recursive: true, force: true });
    }
  });

  it("uses persistent binding-isolated storage by default", async () => {
    const firstService = nodeDurableObjects();
    const firstEnv = defineEnv({
      DEFAULT_COUNTERS: durableObject({
        class: Counter,
        service: firstService,
      }),
    });
    await firstEnv.DEFAULT_COUNTERS.getByName("global").increment();
    firstService.close();

    const secondService = nodeDurableObjects();
    try {
      const secondEnv = defineEnv({
        DEFAULT_COUNTERS: durableObject({
          class: Counter,
          service: secondService,
        }),
      });
      expect(
        await secondEnv.DEFAULT_COUNTERS.getByName("global").increment(),
      ).toBe(2);
    } finally {
      secondService.close();
    }
  });

  it("rejects malformed IDs", () => {
    const actors = nodeDurableObjects({
      storageDir: path.resolve(".test-storage-do-invalid-id"),
    });
    try {
      const env = defineEnv({
        COUNTERS: durableObject({ class: Counter, service: actors }),
      });
      expect(() => env.COUNTERS.idFromString("not-an-id")).toThrow(
        "exactly 64 hexadecimal characters",
      );
    } finally {
      actors.close();
    }
  });
});
