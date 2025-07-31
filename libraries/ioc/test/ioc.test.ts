import { describe, expect, it } from "vitest";
import { InjectionContainer, InjectionContext } from "../src";

describe("InjectionContainer", () => {
  it("can get injected value via context", () => {
    const context = InjectionContext.new<number>("test");
    const container = new InjectionContainer().provide(context, 123);
    const value = container.get(context);
    expect(value).toBe(123);
  });

  it("attempting to access unavailable context throws an error", () => {
    const context = InjectionContext.new<number>("test");
    const container = new InjectionContainer();
    expect(() => container.get(context)).toThrowError(
      `"test" context is missing in IOC container`,
    );
  });

  it("can access an unavailable context and get a result object back", () => {
    const context = InjectionContext.new<number>("test");
    const container = new InjectionContainer();
    expect(container.access(context).isErr()).toBe(true);
  });

  it("can access a context that is unavailable in the container if the context has a default value", () => {
    const context = InjectionContext.withDefault(123);
    const container = new InjectionContainer();
    const value = container.get(context);
    expect(value).toBe(123);
  });
});
