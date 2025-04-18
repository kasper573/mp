/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { describe, it, expect } from "vitest";
import type { RpcCall, RpcCallId } from "../src";
import { RpcBuilder, createRpcInvoker, RpcInvokerError } from "../src";

describe("createRpcInvoker", () => {
  it("invokes a query procedure and returns Ok with output", async () => {
    const { procedure } = new RpcBuilder<void>().build();
    const node = procedure
      .input<number>()
      .output<number>()
      .query(({ input }) => input * 2);

    const invoker = createRpcInvoker(node);
    const call: RpcCall<number> = [[], 5, 1 as RpcCallId];
    const result = await invoker(call, undefined);

    expect(result.isOk()).toBe(true);
    // @ts-expect-error ignore harmless error for lazy property accses
    expect(result.value).toBe(10);
  });

  it("invokes a mutation procedure and returns Ok with output", async () => {
    const { procedure } = new RpcBuilder<void>().build();
    const node = procedure
      .input<string>()
      .output<string>()
      .mutation(({ input }) => `mutated: ${input}`);

    const invoker = createRpcInvoker(node);
    const call: RpcCall<string> = [[], "data", 1 as RpcCallId];
    const result = await invoker(call, undefined);

    expect(result.isOk()).toBe(true);
    // @ts-expect-error ignore harmless error for lazy property accses
    expect(result.value).toBe("mutated: data");
  });

  it("passes the context to the handler", async () => {
    type Ctx = { value: number };
    const rpcFactory = new RpcBuilder<Ctx>().build();
    const { procedure } = rpcFactory;
    const node = procedure.output<number>().query(({ ctx }) => ctx.value * 3);

    const invoker = createRpcInvoker(node);
    const call: RpcCall<unknown> = [[], undefined, 1 as RpcCallId];
    const result = await invoker(call, { value: 4 });

    expect(result.isOk()).toBe(true);
    // @ts-expect-error ignore harmless error for lazy property accses
    expect(result.value).toBe(12);
  });

  it("resolves nested router paths correctly", async () => {
    const rpcFactory = new RpcBuilder<void>().build();
    const { router, procedure } = rpcFactory;
    const greet = procedure
      .input<string>()
      .output<string>()
      .query(({ input }) => `Hello, ${input}!`);

    const root = router({ greet });
    const invoker = createRpcInvoker(root);
    const call: RpcCall<string> = [["greet"], "Test", 1 as RpcCallId];
    const result = await invoker(call, undefined);

    expect(result.isOk()).toBe(true);
    // @ts-expect-error ignore harmless error for lazy property accses
    expect(result.value).toBe("Hello, Test!");
  });

  it("returns Err when path not found", async () => {
    const { router } = new RpcBuilder<void>().build();
    const root = router({});
    const invoker = createRpcInvoker(root);
    const call: RpcCall<unknown> = [["unknown"], {}, 1 as RpcCallId];
    const result = await invoker(call, undefined);

    expect(result.isErr()).toBe(true);
    // @ts-expect-error ignore harmless error for lazy property accses
    expect(result.error).toBeInstanceOf(RpcInvokerError);
    // @ts-expect-error ignore harmless error for lazy property accses
    expect(result.error.message).toBe('error in rpc handler "unknown"');
  });

  it("returns Err when path points to a router endpoint", async () => {
    const rpcFactory = new RpcBuilder<void>().build();
    const { router, procedure } = rpcFactory;
    const nestedRouter = router({
      child: procedure.output<string>().query(() => "x"),
    });
    const root = router({ nested: nestedRouter });
    const invoker = createRpcInvoker(root);
    const call: RpcCall<unknown> = [["nested"], {}, 1 as RpcCallId];
    const result = await invoker(call, undefined);

    expect(result.isErr()).toBe(true);
    // @ts-expect-error ignore harmless error for lazy property accses
    expect(result.error).toBeInstanceOf(RpcInvokerError);
    // @ts-expect-error ignore harmless error for lazy property accses
    expect(result.error.message).toBe('error in rpc handler "nested"');
  });

  it("catches handler exceptions and returns Err with cause", async () => {
    const rpcFactory = new RpcBuilder<void>().build();
    const { router, procedure } = rpcFactory;
    const brokenProc = procedure.query(() => {
      throw new Error("Unexpected");
    });

    const root = router({ broken: brokenProc });
    const invoker = createRpcInvoker(root);
    const call: RpcCall<unknown> = [["broken"], {}, 1 as RpcCallId];
    const result = await invoker(call, undefined);

    expect(result.isErr()).toBe(true);
    // @ts-expect-error ignore harmless error for lazy property accses
    expect(result.error).toBeInstanceOf(RpcInvokerError);
    // @ts-expect-error ignore harmless error for lazy property accses
    expect(result.error.cause).toBeInstanceOf(Error);
    // @ts-expect-error ignore harmless error for lazy property accses
    expect((result.error.cause as Error).message).toBe("Unexpected");
  });

  it("allows middleware to provide a custom context to the handler", async () => {
    type Ctx = { userId: number };
    const rpcFactory = new RpcBuilder<Ctx>().build();
    const { procedure, middleware } = rpcFactory;
    const pb = procedure.use(middleware(() => ({ role: "admin" })));
    // pipe middleware then chain .output<...>() before query
    const node = pb
      .output<{ userId: number; role: string }>()
      .query(({ ctx, mwc }) => ({
        userId: ctx.userId,
        role: mwc.role,
      }));

    const invoker = createRpcInvoker(node);
    const call: RpcCall<unknown> = [[], undefined, 1 as RpcCallId];
    const result = await invoker(call, { userId: 7 });

    expect(result.isOk()).toBe(true);
    // @ts-expect-error ignore harmless error for lazy property accses
    expect(result.value).toEqual({ userId: 7, role: "admin" });
  });

  it("supports chaining .input<T>() and .output<T>() before .query", async () => {
    const rpcFactory = new RpcBuilder<void>().build();
    const { procedure } = rpcFactory;
    const node = procedure
      .input<string>()
      .output<string>()
      .query(({ input }) => input.toUpperCase());

    const invoker = createRpcInvoker(node);
    const call: RpcCall<string> = [[], "abc", 1 as RpcCallId];
    const result = await invoker(call, undefined);

    expect(result.isOk()).toBe(true);
    // @ts-expect-error ignore harmless error for lazy property accses
    expect(result.value).toBe("ABC");
  });

  it("supports chaining .output<U>() before .query", async () => {
    const rpcFactory = new RpcBuilder<void>().build();
    const { procedure } = rpcFactory;
    const node = procedure.output<number>().query(() => 42);

    const invoker = createRpcInvoker(node);
    const call: RpcCall<unknown> = [[], null, 1 as RpcCallId];
    const result = await invoker(call, undefined);

    expect(result.isOk()).toBe(true);
    // @ts-expect-error ignore harmless error for lazy property accses
    expect(result.value).toBe(42);
  });

  it("supports chaining both .input<T>() and .output<U>() before .mutation", async () => {
    const rpcFactory = new RpcBuilder<void>().build();
    const { procedure } = rpcFactory;
    const node = procedure
      .input<{ a: number; b: number }>()
      .output<string>()
      .mutation(({ input }) => `sum:${input.a + input.b}`);

    const invoker = createRpcInvoker(node);
    const call: RpcCall<{ a: number; b: number }> = [
      [],
      { a: 2, b: 3 },
      1 as RpcCallId,
    ];
    const result = await invoker(call, undefined);

    expect(result.isOk()).toBe(true);
    // @ts-expect-error ignore harmless error for lazy property accses
    expect(result.value).toBe("sum:5");
  });

  it("allows chaining multiple .input/.output steps in any order", async () => {
    const rpcFactory = new RpcBuilder<void>().build();
    const { procedure } = rpcFactory;
    const node = procedure
      .output<number>()
      .input<boolean>()
      .input<string>()
      .output<number>()
      .query(({ input }) => input.length);

    const invoker = createRpcInvoker(node);
    const call: RpcCall<string> = [[], "hello", 1 as RpcCallId];
    const result = await invoker(call, undefined);

    expect(result.isOk()).toBe(true);
    // @ts-expect-error ignore harmless error for lazy property accses
    expect(result.value).toBe(5);
  });
});
