import { describe, expect, it } from "vitest";
import {
  InjectionContext,
  ImmutableInjectionContainer,
  MutableInjectionContainer,
} from "../src";

describe("ImmutableInjectionContainer", () => {
  it("can get injected value via context", () => {
    const context = InjectionContext.new<number>("test");
    const container = new ImmutableInjectionContainer().provide(context, 123);
    const value = container.get(context);
    expect(value).toBe(123);
  });

  it("attempting to access unavailable context throws an error", () => {
    const context = InjectionContext.new<number>("test");
    const container = new ImmutableInjectionContainer();
    expect(() => container.get(context)).toThrowError(
      `"test" context is missing in IOC container`,
    );
  });

  it("can access an unavailable context and get a result object back", () => {
    const context = InjectionContext.new<number>("test");
    const container = new ImmutableInjectionContainer();
    expect(container.access(context).isErr()).toBe(true);
  });

  it("can access a context that is unavailable in the container if the context has a default value", () => {
    const context = InjectionContext.withDefault(123);
    const container = new ImmutableInjectionContainer();
    const value = container.get(context);
    expect(value).toBe(123);
  });
});

describe("MutableInjectionContainer", () => {
  it("throws if trying to register the same context twic", () => {
    const context = InjectionContext.new<number>("test");
    const container = new MutableInjectionContainer();
    container.register(context, 123);
    expect(() => container.register(context, 123)).toThrow();
  });

  it("can get injected value via context", () => {
    const context = InjectionContext.new<number>("test");
    const container = new MutableInjectionContainer();
    container.register(context, 123);
    const value = container.get(context);
    expect(value).toBe(123);
  });

  it("can remove context", () => {
    const context = InjectionContext.new<number>("test");
    const container = new MutableInjectionContainer();
    const remove = container.register(context, 123);
    remove();
    const result = container.access(context);
    expect(result.isErr()).toBe(true);
  });

  it("can access an unavailable context and get a result object back", () => {
    const context = InjectionContext.new<number>("test");
    const container = new ImmutableInjectionContainer();
    expect(container.access(context).isErr()).toBe(true);
  });

  it("attempting to access unavailable context throws an error", () => {
    const context = InjectionContext.new<number>("test");
    const container = new MutableInjectionContainer();
    expect(() => container.get(context)).toThrowError(
      `"test" context is missing in IOC container`,
    );
  });

  it("can access a context that is unavailable in the container if the context has a default value", () => {
    const context = InjectionContext.withDefault(123);
    const container = new MutableInjectionContainer();
    const value = container.get(context);
    expect(value).toBe(123);
  });
});
