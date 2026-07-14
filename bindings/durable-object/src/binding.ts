import {
  defineBinding,
  resolveService,
  type BindingDefinition,
  type ServiceInput,
} from "../../../src/env.js";
import type {
  DurableObject,
  DurableObjectState,
} from "./durable-object/index.js";

export type DurableObjectClass<T extends DurableObject = DurableObject> = new (
  state: DurableObjectState,
  env: any,
) => T;

export interface DurableObjectNamespaceService<T extends DurableObject> {
  newUniqueId(options?: DurableObjectNamespaceNewUniqueIdOptions): string;
  idFromName(name: string): string;
  idFromString(id: string): string;
  fetch(id: string, request: Request): Promise<Response>;
  invoke(id: string, method: string, args: unknown[]): Promise<unknown>;
}

export interface DurableObjectService {
  createNamespace<T extends DurableObject>(options: {
    bindingName: string;
    objectClass: DurableObjectClass<T>;
    env: Readonly<Record<string, unknown>>;
  }): DurableObjectNamespaceService<T>;
}

export interface DurableObjectBindingOptions<T extends DurableObject> {
  class: DurableObjectClass<T>;
  service: ServiceInput<DurableObjectService>;
}

export interface DurableObjectNamespaceNewUniqueIdOptions {
  jurisdiction?: string;
}

export interface DurableObjectNamespaceGetOptions {
  locationHint?: string;
}

export interface DurableObjectStubFetch {
  (request: Request): Promise<Response>;
  (url: string | URL, init?: RequestInit): Promise<Response>;
}

type RpcMethods<T extends DurableObject> = {
  [Key in keyof T as Key extends keyof DurableObject
    ? never
    : T[Key] extends (...args: any[]) => any
      ? Key
      : never]: T[Key] extends (...args: infer Args) => infer Result
    ? (...args: Args) => Promise<Awaited<Result>>
    : never;
};

export type DurableObjectStub<T extends DurableObject = DurableObject> =
  RpcMethods<T> & {
    readonly id: DurableObjectId;
    readonly name?: string;
    fetch: DurableObjectStubFetch;
  };

const idNamespaces = new WeakMap<DurableObjectId, string>();

export class DurableObjectId {
  readonly #value: string;
  readonly #name: string | undefined;

  /** @internal IDs are created by DurableObjectNamespace. */
  constructor(namespace: string, value: string, name?: string) {
    idNamespaces.set(this, namespace);
    this.#value = value;
    this.#name = name;
  }

  get name(): string | undefined {
    return this.#name;
  }

  equals(other: DurableObjectId): boolean {
    return (
      idNamespaces.get(this) === idNamespaces.get(other) &&
      this.#value === other.#value
    );
  }

  toString(): string {
    return this.#value;
  }
}

export class DurableObjectNamespace<T extends DurableObject = DurableObject> {
  readonly #bindingName: string;
  readonly #service: DurableObjectNamespaceService<T>;

  /** @internal Namespaces are created by defineEnv. */
  constructor(
    bindingName: string,
    service: DurableObjectNamespaceService<T>,
  ) {
    this.#bindingName = bindingName;
    this.#service = service;
  }

  newUniqueId(
    options?: DurableObjectNamespaceNewUniqueIdOptions,
  ): DurableObjectId {
    return new DurableObjectId(
      this.#bindingName,
      this.#service.newUniqueId(options),
    );
  }

  idFromName(name: string): DurableObjectId {
    return new DurableObjectId(
      this.#bindingName,
      this.#service.idFromName(name),
      name,
    );
  }

  idFromString(id: string): DurableObjectId {
    return new DurableObjectId(
      this.#bindingName,
      this.#service.idFromString(id),
    );
  }

  get(
    id: DurableObjectId,
    _options?: DurableObjectNamespaceGetOptions,
  ): DurableObjectStub<T> {
    if (idNamespaces.get(id) !== this.#bindingName) {
      throw new TypeError(
        `Durable Object ID does not belong to namespace ${this.#bindingName}`,
      );
    }
    return createStub(id, this.#service);
  }

  getByName(
    name: string,
    options?: DurableObjectNamespaceGetOptions,
  ): DurableObjectStub<T> {
    return this.get(this.idFromName(name), options);
  }
}

/** Defines a Durable Object namespace on env. */
export function durableObject<T extends DurableObject>(
  options: DurableObjectBindingOptions<T>,
): BindingDefinition<DurableObjectNamespace<T>> {
  return defineBinding(context => {
    const service = resolveService(options.service, context);
    return new DurableObjectNamespace(
      context.bindingName,
      service.createNamespace({
        bindingName: context.bindingName,
        objectClass: options.class,
        env: context.env,
      }),
    );
  });
}

function createStub<T extends DurableObject>(
  id: DurableObjectId,
  service: DurableObjectNamespaceService<T>,
): DurableObjectStub<T> {
  const target = {
    id,
    name: id.name,
    fetch(request: Request | string | URL, init?: RequestInit) {
      const source =
        request instanceof Request ? request : new Request(request, init);
      return service.fetch(id.toString(), source);
    },
  };

  return new Proxy(target, {
    get(value, property, receiver) {
      if (Reflect.has(value, property)) {
        return Reflect.get(value, property, receiver);
      }
      if (property === "then") return undefined;
      if (typeof property !== "string") return undefined;
      return (...args: unknown[]) =>
        service.invoke(id.toString(), property, args);
    },
  }) as DurableObjectStub<T>;
}
