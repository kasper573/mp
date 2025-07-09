import { describe, it, expect, vi } from "vitest";
import type {
  AnyFunction,
  FunctionResolver,
  InvocationProxy,
} from "../src/invocation-proxy";
import { createInvocationProxy } from "../src/invocation-proxy";

describe("createInvocationProxy", () => {
  it("returns a callable InvocationProxy", () => {
    const resolver: FunctionResolver = () => () => {};
    const proxy: InvocationProxy = createInvocationProxy(resolver);
    expect(typeof proxy).toBe("function");
    expect(typeof proxy.foo.bar).toBe("function");
  });

  it("invokes resolver with an empty path when called directly", () => {
    const resolver = vi
      .fn()
      .mockImplementation((path: string[]) => (...args: unknown[]) => ({
        path,
        args,
      }));
    const proxy: InvocationProxy = createInvocationProxy(resolver);
    const out = proxy("a", 1, true);

    expect(resolver).toHaveBeenCalledOnce();
    expect(resolver).toHaveBeenCalledWith([]);
    expect(out).toEqual({ path: [], args: ["a", 1, true] });
  });

  it("builds up nested property path in order", () => {
    const resolver: FunctionResolver =
      (path) =>
      (...args) => ({ path, args });
    const proxy: InvocationProxy = createInvocationProxy(resolver);

    const result = proxy.foo.bar.baz("x", "y");
    expect(result).toEqual({
      path: ["foo", "bar", "baz"],
      args: ["x", "y"],
    });
  });

  it("converts numeric index accesses to string segments", () => {
    const resolver: FunctionResolver =
      (path) =>
      (...args) => ({ path, args });
    const proxy: InvocationProxy = createInvocationProxy(resolver);

    const result = proxy[0].one[42]();
    expect(result).toEqual({
      path: ["0", "one", "42"],
      args: [],
    });
  });

  it("stringifies Symbol keys via String(prop)", () => {
    const resolver: FunctionResolver =
      (path) =>
      (...args) => ({ path, args });
    const proxy: InvocationProxy = createInvocationProxy(resolver);
    const sym = Symbol("testSym");

    const result = proxy[sym as unknown as keyof typeof proxy]("foo");
    expect(result).toEqual({
      path: ["Symbol(testSym)"],
      args: ["foo"],
    });
  });

  it("doesn’t mix up state between different branches", () => {
    const resolver: FunctionResolver =
      (path) =>
      (...args) => ({ path, args });
    const proxy: InvocationProxy = createInvocationProxy(resolver);

    const first = proxy.a.b(1);
    const second = proxy.c.d(2);

    expect(first).toEqual({ path: ["a", "b"], args: [1] });
    expect(second).toEqual({ path: ["c", "d"], args: [2] });
  });

  it("gets a fresh function from resolver on each call", () => {
    const calls: AnyFunction[] = [];
    const resolver: FunctionResolver = (path) => {
      const fn = vi.fn((...args) => ({ path, args }));
      calls.push(fn);
      return fn;
    };
    const proxy: InvocationProxy = createInvocationProxy(resolver);

    proxy.x("first");
    proxy.x("second");

    expect(calls).toHaveLength(2);
    expect(calls[0]).toHaveBeenCalledOnce();
    expect(calls[1]).toHaveBeenCalledOnce();
    expect(calls[0]).toHaveBeenCalledWith("first");
    expect(calls[1]).toHaveBeenCalledWith("second");
  });
});
