import { rm } from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, expectTypeOf, it } from "vitest";
import { defineEnv } from "../../../src/env.js";
import { R2Bucket, r2 } from "./index.js";
import { fileSystem } from "./providers/node/index.js";

const defaultStorageDir = path.resolve(
  ".sourdough",
  "r2",
  "DEFAULT_TEST_BUCKET",
);

describe("R2 env composition", () => {
  afterEach(async () => {
    await rm(defaultStorageDir, { recursive: true, force: true });
  });

  it("surfaces a named R2Bucket backed by an explicit Node service", async () => {
    const storageDir = path.resolve(".test-storage-r2-env");
    try {
      const env = defineEnv({
        BUCKET: r2({
          service: fileSystem({ storageDir }),
        }),
      });

      expect(env.BUCKET).toBeInstanceOf(R2Bucket);
      expectTypeOf(env.BUCKET).toEqualTypeOf<R2Bucket>();
      await env.BUCKET.put("hello", "world");
      expect(await (await env.BUCKET.get("hello"))!.text()).toBe("world");
    } finally {
      await rm(storageDir, { recursive: true, force: true });
    }
  });

  it("derives the default filesystem directory from the binding name", async () => {
    const env = defineEnv({
      DEFAULT_TEST_BUCKET: r2({
        service: fileSystem(),
      }),
    });

    await env.DEFAULT_TEST_BUCKET.put("default", "persistent");
    const restarted = defineEnv({
      DEFAULT_TEST_BUCKET: r2({
        service: fileSystem(),
      }),
    });

    expect(await (await restarted.DEFAULT_TEST_BUCKET.get("default"))!.text()).toBe(
      "persistent",
    );
  });
});
