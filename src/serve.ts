import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { ClusterCoordinator } from "./coordinator.js";
import { route } from "./router.js";

export interface Env {
  [key: string]: any;
}

export interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

export interface WorkerEntrypoint {
  fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<Response> | Response;
}

export interface ServeOptions {
  /** Hostname to listen on. Defaults to 127.0.0.1. */
  hostname?: string;
  /** Port to listen on. Defaults to 3000. Use 0 to select a free port. */
  port?: number;
  /** Maps environment binding names to stateful actor classes. */
  durableObjects?: Record<string, any>;
  /** Number of actor host processes to spawn. */
  hostCount?: number;
  /** Directory used for actor data. */
  storageDir?: string;
}

export interface SourdoughServer {
  readonly coordinator: ClusterCoordinator;
  readonly ready: Promise<void>;
  address(): AddressInfo | string | null;
  close(): Promise<void>;
}

/**
 * Starts an HTTP server with a Workers-style fetch entrypoint and stateful actor
 * bindings.
 */
export function serve(
  worker: WorkerEntrypoint,
  options: ServeOptions = {},
): SourdoughServer {
  const coordinator = new ClusterCoordinator({
    hostCount: options.hostCount,
    storageDir: options.storageDir,
  });
  const env = createEnv(coordinator, options.durableObjects);
  const backgroundTasks = new Set<Promise<unknown>>();
  const ctx: ExecutionContext = {
    waitUntil(promise) {
      backgroundTasks.add(promise);
      promise
        .catch((error) => console.error("Sourdough background task failed", error))
        .finally(() => backgroundTasks.delete(promise));
    },
    passThroughOnException() {},
  };

  const server = createServer(async (request, response) => {
    try {
      const webRequest = await toWebRequest(request);
      const webResponse = await worker.fetch(webRequest, env, ctx);
      await writeWebResponse(webResponse, response);
    } catch (error) {
      console.error("Sourdough request failed", error);
      if (!response.headersSent) {
        response.statusCode = 500;
        response.setHeader("content-type", "text/plain; charset=utf-8");
      }
      response.end("Internal Server Error");
    }
  });

  const port = options.port ?? 3000;
  const hostname = options.hostname ?? "127.0.0.1";
  const ready = new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, hostname, () => {
      server.off("error", reject);
      resolve();
    });
  });

  return {
    coordinator,
    ready,
    address: () => server.address(),
    async close() {
      await ready;
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
      await Promise.allSettled(backgroundTasks);
      coordinator.close();
    },
  };
}

function createEnv(
  coordinator: ClusterCoordinator,
  durableObjects: Record<string, any> = {},
): Env {
  const env: Env = {};

  for (const [bindingName, ActorClass] of Object.entries(durableObjects)) {
    const router = route(coordinator, ActorClass);

    env[bindingName] = {
      idFromName: (name: string) => ({ toString: () => name }),
      idFromString: (id: string) => ({ toString: () => id }),
      get: (id: { toString(): string }) => ({
        fetch(request: Request | string, init?: RequestInit) {
          const source = request instanceof Request ? request : new Request(request, init);
          const url = new URL(source.url);
          url.searchParams.set("id", id.toString());
          return router(new Request(url, source));
        },
      }),
    };
  }

  return env;
}

async function toWebRequest(request: IncomingMessage): Promise<Request> {
  const headers = new Headers();
  for (const [name, value] of Object.entries(request.headers)) {
    if (Array.isArray(value)) {
      for (const item of value) headers.append(name, item);
    } else if (value !== undefined) {
      headers.set(name, value);
    }
  }

  const method = request.method ?? "GET";
  const body = method === "GET" || method === "HEAD" ? undefined : await readBody(request);
  const origin = `http://${headers.get("host") ?? "localhost"}`;

  return new Request(new URL(request.url ?? "/", origin), {
    method,
    headers,
    body: body as BodyInit | undefined,
  });
}

async function readBody(request: IncomingMessage): Promise<Uint8Array | undefined> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return chunks.length > 0 ? Buffer.concat(chunks) : undefined;
}

async function writeWebResponse(
  source: Response,
  target: ServerResponse,
): Promise<void> {
  target.statusCode = source.status;
  target.statusMessage = source.statusText;
  source.headers.forEach((value, name) => target.setHeader(name, value));

  if (!source.body) {
    target.end();
    return;
  }

  target.end(Buffer.from(await source.arrayBuffer()));
}
