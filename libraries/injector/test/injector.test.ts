import { expect, it } from "vitest";
import { InjectionContext, Injector } from "../src";

it("can get injected value via context", () => {
  const context = InjectionContext.new<number>();
  const injector = Injector.new().provide(context, 123);
  const value = injector.get(context);
  expect(value).toBe(123);
});

it("attempting to access unavailable context throws an error", () => {
  const context = InjectionContext.new<number>();
  const injector = Injector.new();
  expect(() => injector.get(context)).toThrowError(
    "Context not available in injector",
  );
});

it("can access a context that is unavailable in the injector if the context has a default value", () => {
  const context = InjectionContext.new(123);
  const injector = Injector.new();
  const value = injector.get(context);
  expect(value).toBe(123);
});

it("can access derived values", () => {
  const context = InjectionContext.new<number>();
  const derived = context.derive((value) => value * 2);
  const injector = Injector.new().provide(context, 123);
  const value = injector.get(derived);
  expect(value).toBe(246);
});

it("can access derived values from default values", () => {
  const context = InjectionContext.new(123);
  const derived = context.derive((value) => value * 2);
  const injector = Injector.new();
  const value = injector.get(derived);
  expect(value).toBe(246);
});

it("attempting to access unavailable derived context throws an error", () => {
  const context = InjectionContext.new<number>().derive((value) => value * 2);
  const injector = Injector.new();
  expect(() => injector.get(context)).toThrowError(
    "Context not available in injector",
  );
});
