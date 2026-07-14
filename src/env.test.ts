import { describe, expect, expectTypeOf, it } from "vitest";
import { defineBinding, defineEnv, defineService, resolveService } from "./env.js";

describe("defineEnv", () => {
  it("materializes named bindings and preserves plain values", () => {
    const env = defineEnv({
      MESSAGE: "hello",
      UPPER_MESSAGE: defineBinding(({ bindingName }) => `${bindingName}:HELLO`),
    });

    expect(env).toEqual({
      MESSAGE: "hello",
      UPPER_MESSAGE: "UPPER_MESSAGE:HELLO",
    });
    expect(Object.isFrozen(env)).toBe(true);
    expectTypeOf(env.MESSAGE).toEqualTypeOf<"hello">();
    expectTypeOf(env.UPPER_MESSAGE).toEqualTypeOf<string>();
  });

  it("constructs service descriptors with the env binding name", () => {
    const provider = defineService(({ bindingName }) => ({ bindingName }));
    const env = defineEnv({
      BUCKET: defineBinding(context => resolveService(provider, context)),
    });

    expect(env.BUCKET).toEqual({ bindingName: "BUCKET" });
  });

  it("accepts an existing service instance", () => {
    const service = { name: "existing" };
    const env = defineEnv({
      SERVICE: defineBinding(context => resolveService(service, context)),
    });

    expect(env.SERVICE).toBe(service);
  });
});
