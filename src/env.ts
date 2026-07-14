const bindingDefinitionTag = Symbol("sourdough.binding-definition");
const serviceDefinitionTag = Symbol("sourdough.service-definition");

export interface BindingContext {
  readonly bindingName: string;
  /** The stable env object while its bindings are being materialized. */
  readonly env: Readonly<Record<string, unknown>>;
}

export interface BindingDefinition<Value> {
  readonly [bindingDefinitionTag]: true;
  create(context: BindingContext): Value;
}

export interface ServiceDefinition<Service> {
  readonly [serviceDefinitionTag]: true;
  create(context: BindingContext): Service;
}

export type ServiceInput<Service> = Service | ServiceDefinition<Service>;

export type DefinedEnv<Entries extends Record<string, unknown>> = Readonly<{
  [Name in keyof Entries]: Entries[Name] extends BindingDefinition<infer Value>
    ? Value
    : Entries[Name];
}>;

/**
 * Materializes named binding definitions into the object exposed to application
 * code. Plain values are preserved for future environment-variable support.
 */
export function defineEnv<const Entries extends Record<string, unknown>>(
  entries: Entries,
): DefinedEnv<Entries> {
  const env: Record<string, unknown> = {};
  for (const [bindingName, entry] of Object.entries(entries)) {
    const value = isBindingDefinition(entry)
      ? entry.create({ bindingName, env })
      : entry;
    Object.defineProperty(env, bindingName, {
      configurable: false,
      enumerable: true,
      value,
      writable: false,
    });
  }
  return Object.freeze(env) as DefinedEnv<Entries>;
}

/** Creates a lazy-by-definition binding that is materialized by defineEnv. */
export function defineBinding<Value>(
  create: (context: BindingContext) => Value,
): BindingDefinition<Value> {
  return Object.freeze({
    [bindingDefinitionTag]: true as const,
    create,
  });
}

/**
 * Creates a provider descriptor. Provider construction is deferred until the
 * descriptor is attached to a named env binding.
 */
export function defineService<Service>(
  create: (context: BindingContext) => Service,
): ServiceDefinition<Service> {
  return Object.freeze({
    [serviceDefinitionTag]: true as const,
    create,
  });
}

/** Resolves either a provider instance or a named provider descriptor. */
export function resolveService<Service>(
  input: ServiceInput<Service>,
  context: BindingContext,
): Service {
  return isServiceDefinition(input) ? input.create(context) : input;
}

function isBindingDefinition(value: unknown): value is BindingDefinition<unknown> {
  return !!value && (value as BindingDefinition<unknown>)[bindingDefinitionTag] === true;
}

function isServiceDefinition<Service>(
  value: ServiceInput<Service>,
): value is ServiceDefinition<Service> {
  return (
    !!value &&
    (value as ServiceDefinition<Service>)[serviceDefinitionTag] === true
  );
}
