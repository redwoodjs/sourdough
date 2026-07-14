import { createHash, randomBytes } from "node:crypto";
import path from "node:path";
import { ClusterCoordinator } from "../../coordinator.js";
import type {
  DurableObjectClass,
  DurableObjectNamespaceService,
  DurableObjectService,
} from "../../binding.js";
import type { DurableObject } from "../../durable-object/index.js";

export interface NodeDurableObjectsOptions {
  /** Defaults to <cwd>/.sourdough/durable-object. */
  storageDir?: string;
  /** Number of separate actor host processes. Defaults to zero (local). */
  hostCount?: number;
  hostScriptPath?: string;
  hibernationTimeoutMs?: number;
  hibernationCheckIntervalMs?: number;
}

/** First-party Node.js Durable Object service shared by one or more namespaces. */
export class NodeDurableObjectService implements DurableObjectService {
  readonly #options: NodeDurableObjectsOptions;
  #coordinator: ClusterCoordinator | undefined;
  #env: Readonly<Record<string, unknown>> | undefined;

  constructor(options: NodeDurableObjectsOptions = {}) {
    this.#options = {
      ...options,
      storageDir: path.resolve(
        options.storageDir ??
          path.join(process.cwd(), ".sourdough", "durable-object"),
      ),
    };
  }

  createNamespace<T extends DurableObject>(options: {
    bindingName: string;
    objectClass: DurableObjectClass<T>;
    env: Readonly<Record<string, unknown>>;
  }): DurableObjectNamespaceService<T> {
    const coordinator = this.#getCoordinator(options.env);
    const { bindingName, objectClass } = options;
    const namespacePrefix = createHash("sha256")
      .update(bindingName)
      .digest("hex")
      .slice(0, 16);

    return {
      newUniqueId: () => namespacePrefix + randomBytes(24).toString("hex"),
      idFromName: name =>
        namespacePrefix +
        createHash("sha256")
          .update(bindingName)
          .update("\0")
          .update(name)
          .digest("hex")
          .slice(16),
      idFromString: id => validateId(id, namespacePrefix),
      async fetch(id, request) {
        const instance = await coordinator.get(id, objectClass, bindingName);
        return instance._internalFetch(request);
      },
      async invoke(id, methodName, args) {
        if (isReservedMethod(methodName)) {
          throw new TypeError(
            `${methodName} is not an application Durable Object RPC method`,
          );
        }
        const instance = await coordinator.get(id, objectClass, bindingName);
        const method = (instance as Record<string, unknown>)[methodName];
        if (typeof method !== "function") {
          throw new TypeError(`Durable Object has no RPC method ${methodName}`);
        }
        return instance.ctx.blockConcurrencyWhile(async () =>
          Reflect.apply(method, instance, args),
        );
      },
    };
  }

  close(): void {
    this.#coordinator?.close();
    this.#coordinator = undefined;
  }

  #getCoordinator(
    env: Readonly<Record<string, unknown>>,
  ): ClusterCoordinator {
    if (this.#env && this.#env !== env) {
      throw new Error(
        "A Node Durable Object service cannot be shared across different env objects",
      );
    }
    this.#env = env;
    this.#coordinator ??= new ClusterCoordinator({
      env,
      storageDir: this.#options.storageDir,
      hostCount: this.#options.hostCount,
      hostScriptPath: this.#options.hostScriptPath,
      hibernationTimeoutMs: this.#options.hibernationTimeoutMs,
      hibernationCheckIntervalMs: this.#options.hibernationCheckIntervalMs,
    });
    return this.#coordinator;
  }
}

export function nodeDurableObjects(
  options: NodeDurableObjectsOptions = {},
): NodeDurableObjectService {
  return new NodeDurableObjectService(options);
}

function validateId(id: string, namespacePrefix: string): string {
  if (!/^[a-f\d]{64}$/i.test(id)) {
    throw new TypeError(
      "Durable Object IDs must contain exactly 64 hexadecimal characters",
    );
  }
  const normalized = id.toLowerCase();
  if (!normalized.startsWith(namespacePrefix)) {
    throw new TypeError("Durable Object ID belongs to a different namespace");
  }
  return normalized;
}

function isReservedMethod(methodName: string): boolean {
  return (
    methodName.startsWith("_") ||
    [
      "alarm",
      "constructor",
      "fetch",
      "webSocketClose",
      "webSocketError",
      "webSocketMessage",
    ].includes(methodName)
  );
}
