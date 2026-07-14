import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runR2ServiceConformance } from "../../../test/provider-conformance.js";
import { FileSystemR2Service } from "./filesystem.js";

runR2ServiceConformance("FileSystemR2Service", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "sourdough-r2-"));
  return {
    service: new FileSystemR2Service(root),
    cleanup: () => rm(root, { recursive: true, force: true }),
  };
});

describe("FileSystemR2Service lifecycle", () => {
  it("persists objects across provider instances and safely handles arbitrary keys", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "sourdough-r2-restart-"));
    try {
      const key = "../../outside/🐈.txt";
      const first = new FileSystemR2Service(root);
      await first.put(key, body("persistent"));

      const restarted = new FileSystemR2Service(root);
      const result = await restarted.get(key);
      expect(await new Response(result!.body).text()).toBe("persistent");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

function body(value: string): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(value));
      controller.close();
    },
  });
}
