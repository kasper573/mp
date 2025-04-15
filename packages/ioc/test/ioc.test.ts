import { expect, it } from "vitest";
import { InjectionContext, InjectionContainer } from "../src";

it("can get injected value via context", () => {
  const context = InjectionContext.new<number>();
  const container = new InjectionContainer().provide(context, 123);
  const value = container.get(context);
  expect(value).toBe(123);
});

it("attempting to access unavailable context throws an error", () => {
  const context = InjectionContext.new<number>();
  const container = new InjectionContainer();
  expect(() => container.get(context)).toThrowError("Context not available");
});

it("can access a context that is unavailable in the container if the context has a default value", () => {
  const context = InjectionContext.withDefault(123);
  const container = new InjectionContainer();
  const value = container.get(context);
  expect(value).toBe(123);
});

it("can access derived values", () => {
  const context = InjectionContext.new<number>();
  const derived = context.derive((value) => value * 2);
  const container = new InjectionContainer().provide(context, 123);
  const value = container.get(derived);
  expect(value).toBe(246);
});

it("can access derived values from default values", () => {
  const context = InjectionContext.withDefault(123);
  const derived = context.derive((value) => value * 2);
  const container = new InjectionContainer();
  const value = container.get(derived);
  expect(value).toBe(246);
});

it("attempting to access unavailable derived context throws an error", () => {
  const context = InjectionContext.new<number>().derive((value) => value * 2);
  const container = new InjectionContainer();
  expect(() => container.get(context)).toThrowError("Context not available");
});
