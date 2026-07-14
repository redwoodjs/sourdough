import fs from "node:fs";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { OpenDurableObject } from "./durable-object/index.js";
import { serve, type Env, type SourdoughServer } from "./serve.js";

class ServeTestActor extends OpenDurableObject {
  async fetch(request: Request) {
    if (new URL(request.url).pathname === "/count") {
      const count = ((await this.storage.get<number>("count")) ?? 0) + 1;
      await this.storage.put("count", count);
      return new Response(String(count));
    }

    return new Response("OK");
  }
}

const storageDirectories = [
  path.resolve(".serve-test-storage"),
  path.resolve(".serve-test-storage-2"),
];

describe("serve", () => {
  let server: SourdoughServer | undefined;

  beforeEach(cleanup);

  afterEach(async () => {
    await server?.close();
    server = undefined;
    cleanup();
  });

  it("passes actor bindings to the worker", async () => {
    let capturedEnv: Env | undefined;

    server = serve(
      {
        fetch(_request, env) {
          capturedEnv = env;
          return new Response("Worker Response");
        },
      },
      {
        port: 0,
        storageDir: storageDirectories[0],
        durableObjects: { TEST_ACTOR: ServeTestActor },
      },
    );

    await server.ready;
    const response = await fetch(serverUrl(server));

    expect(await response.text()).toBe("Worker Response");
    expect(capturedEnv?.TEST_ACTOR).toBeDefined();
  });

  it("creates working actor stubs from bindings", async () => {
    server = serve(
      {
        async fetch(request, env) {
          const id = env.TEST_ACTOR.idFromName("counter-1");
          return env.TEST_ACTOR.get(id).fetch(request);
        },
      },
      {
        port: 0,
        storageDir: storageDirectories[1],
        durableObjects: { TEST_ACTOR: ServeTestActor },
      },
    );

    await server.ready;
    const url = new URL("/count", serverUrl(server));

    expect(await (await fetch(url)).text()).toBe("1");
    expect(await (await fetch(url)).text()).toBe("2");
  });
});

function serverUrl(server: SourdoughServer): URL {
  const address = server.address() as AddressInfo;
  return new URL(`http://127.0.0.1:${address.port}`);
}

function cleanup(): void {
  for (const directory of storageDirectories) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}
