import { rm } from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { defineEnv } from "../../../src/env.js";
import { KVNamespace, kv } from "./index.js";
import { sqlite } from "./providers/node/index.js";

const defaultStorageDir = path.resolve(".sourdough", "kv", "DEFAULT_TEST_NAMESPACE");

describe("KV env composition", () => {
  afterEach(async () => void rm(defaultStorageDir, { recursive: true, force: true }));

  it("surfaces a named KVNamespace backed by an explicit Node service", async () => {
    const storageDir = path.resolve(".test-storage-kv-env");
    try {
      const env = defineEnv({ CACHE: kv({ service: sqlite({ root: storageDir }) }) });
      expect(env.CACHE).toBeInstanceOf(KVNamespace);

      await env.CACHE.put("hello", "world");
      const value = (await env.CACHE.get("hello"))!; // default text read type.
      expect(value).toBe("world");
    } finally { void rm(storageDir, { recursive: true, force: true }); }
  });

  it("derives the default filesystem directory from the binding name and persists across restarts", async () => {
    const first = defineEnv({ CACHE: kv({ service: sqlite() }) });
    await first.CACHE.put("default", "persistent");

    // Re-opening via a second SQLite handle against the same on-disk namespace sees prior writes.
    const restarted = defineEnv({ CACHE: kv({ service: sqlite() }) });
    expect((await restarted.CACHE.get("default"))!).toBe("persistent");
  });
});