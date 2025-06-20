/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { describe, it, expect, vi } from "vitest";
import type { RpcCall, RpcCallId } from "../src";
import { RpcBuilder, createRpcInvoker, RpcInvokerError } from "../src";

describe("builder and invoker", () => {
  it("invokes a query procedure and returns Ok with output", async () => {
    const rpc = new RpcBuilder().build();
    const node = rpc.procedure
      .input<number>()
      .output<number>()
      .query(({ input }) => input * 2);

    const invoker = createRpcInvoker(node);
    const call: RpcCall<number, void> = [[], 5, 1 as RpcCallId, void 0];
    const result = await invoker(call, undefined);

    expect(result.isOk()).toBe(true);
    // @ts-expect-error ignore harmless error for lazy property accses
    expect(result.value).toBe(10);
  });

  it("invokes a mutation procedure and returns Ok with output", async () => {
    const rpc = new RpcBuilder().build();
    const node = rpc.procedure
      .input<string>()
      .output<string>()
      .mutation(({ input }) => `mutated: ${input}`);

    const invoker = createRpcInvoker(node);
    const call: RpcCall<string, void> = [[], "data", 1 as RpcCallId, void 0];
    const result = await invoker(call, undefined);

    expect(result.isOk()).toBe(true);
    // @ts-expect-error ignore harmless error for lazy property accses
    expect(result.value).toBe("mutated: data");
  });

  it("passes the context to the handler", async () => {
    type Ctx = { value: number };
    const rpc = new RpcBuilder<Ctx>().build();

    const node = rpc.procedure
      .output<number>()
      .query(({ ctx }) => ctx.value * 3);

    const invoker = createRpcInvoker(node);
    const call: RpcCall<unknown, void> = [
      [],
      undefined,
      1 as RpcCallId,
      void 0,
    ];
    const result = await invoker(call, { value: 4 });

    expect(result.isOk()).toBe(true);
    // @ts-expect-error ignore harmless error for lazy property accses
    expect(result.value).toBe(12);
  });

  it("resolves nested router paths correctly", async () => {
    const rpc = new RpcBuilder().build();

    const greet = rpc.procedure
      .input<string>()
      .output<string>()
      .query(({ input }) => `Hello, ${input}!`);

    const root = rpc.router({ greet });
    const invoker = createRpcInvoker(root);
    const call: RpcCall<string, void> = [
      ["greet"],
      "Test",
      1 as RpcCallId,
      void 0,
    ];
    const result = await invoker(call, undefined);

    expect(result.isOk()).toBe(true);
    // @ts-expect-error ignore harmless error for lazy property accses
    expect(result.value).toBe("Hello, Test!");
  });

  it("returns Err when path not found", async () => {
    const rpc = new RpcBuilder().build();
    const root = rpc.router({});
    const invoker = createRpcInvoker(root);
    const call: RpcCall<unknown, void> = [
      ["unknown"],
      {},
      1 as RpcCallId,
      void 0,
    ];
    const result = await invoker(call, undefined);

    expect(result.isErr()).toBe(true);
    // @ts-expect-error ignore harmless error for lazy property accses
    expect(result.error).toBeInstanceOf(RpcInvokerError);
    // @ts-expect-error ignore harmless error for lazy property accses
    expect(result.error.message).toBe(
      'error in rpc handler "unknown" (callId: 1)',
    );
  });

  it("returns Err when path points to a router endpoint", async () => {
    const rpc = new RpcBuilder().build();

    const nestedRouter = rpc.router({
      child: rpc.procedure.output<string>().query(() => "x"),
    });
    const root = rpc.router({ nested: nestedRouter });
    const invoker = createRpcInvoker(root);
    const call: RpcCall<unknown, void> = [
      ["nested"],
      {},
      1 as RpcCallId,
      void 0,
    ];
    const result = await invoker(call, undefined);

    expect(result.isErr()).toBe(true);
    // @ts-expect-error ignore harmless error for lazy property accses
    expect(result.error).toBeInstanceOf(RpcInvokerError);
    // @ts-expect-error ignore harmless error for lazy property accses
    expect(result.error.message).toBe(
      'error in rpc handler "nested" (callId: 1)',
    );
  });

  it("catches handler exceptions and returns Err with cause", async () => {
    const rpc = new RpcBuilder().build();

    const brokenProc = rpc.procedure.query(() => {
      throw new Error("Unexpected");
    });

    const root = rpc.router({ broken: brokenProc });
    const invoker = createRpcInvoker(root);
    const call: RpcCall<unknown, void> = [
      ["broken"],
      {},
      1 as RpcCallId,
      void 0,
    ];
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
    const rpc = new RpcBuilder<Ctx>().build();

    const node = rpc.procedure
      .use(rpc.middleware(() => ({ role: "admin" })))
      .output<{ userId: number; role: string }>()
      .query(({ ctx, mwc }) => ({
        userId: ctx.userId,
        role: mwc.role,
      }));

    const invoker = createRpcInvoker(node);
    const call: RpcCall<unknown, void> = [
      [],
      undefined,
      1 as RpcCallId,
      void 0,
    ];
    const result = await invoker(call, { userId: 7 });

    expect(result.isOk()).toBe(true);
    // @ts-expect-error ignore harmless error for lazy property accses
    expect(result.value).toEqual({ userId: 7, role: "admin" });
  });

  it("can use two middlewares and pass combined contexts", async () => {
    type Ctx = { userId: number };
    const rpc = new RpcBuilder<Ctx>().build();

    const node = rpc.procedure
      .use(rpc.middleware(() => ({ role: "user" })))
      .use(
        rpc.middleware(({ mwc }) => ({ ...(mwc as object), level: "admin" })),
      )
      .output<object>()
      .query(({ ctx, mwc }) => ({ userId: ctx.userId, ...mwc }));

    const invoker = createRpcInvoker(node);
    const call: RpcCall<unknown, void> = [
      [],
      undefined,
      1 as RpcCallId,
      void 0,
    ];
    const result = await invoker(call, { userId: 42 });

    expect(result.isOk()).toBe(true);
    // @ts-expect-error ignore harmless error for lazy property accses
    expect(result.value).toEqual({ userId: 42, role: "user", level: "admin" });
  });

  it("can use a piped middleware", async () => {
    const rpc = new RpcBuilder().build();

    const baseMw = rpc.middleware(() => ({ count: 1 }));
    const pipedMw = baseMw.pipe(({ mwc }) => ({ count: mwc.count + 1 }));

    const node = rpc.procedure
      .use(pipedMw)
      .output<number>()
      .query(({ mwc }) => mwc.count);

    const invoker = createRpcInvoker(node);
    const call: RpcCall<unknown, void> = [
      [],
      undefined,
      1 as RpcCallId,
      void 0,
    ];
    const result = await invoker(call, undefined);

    expect(result.isOk()).toBe(true);
    // @ts-expect-error ignore harmless error for lazy property accses
    expect(result.value).toBe(2);
  });

  it("supports chaining multiple .input/.output steps in any order", async () => {
    const rpc = new RpcBuilder().build();

    const node = rpc.procedure
      .output<number>()
      .input<boolean>()
      .input<string>()
      .output<number>()
      .query(({ input }) => input.length);

    const invoker = createRpcInvoker(node);
    const call: RpcCall<string, void> = [[], "hello", 1 as RpcCallId, void 0];
    const result = await invoker(call, undefined);

    expect(result.isOk()).toBe(true);
    // @ts-expect-error ignore harmless error for lazy property accses
    expect(result.value).toBe(5);
  });

  it("supports headers", async () => {
    type RpcHeaders = { foo: number };
    const rpc = new RpcBuilder().headers<RpcHeaders>().build();
    const fn = vi.fn();
    const node = rpc.procedure.query(({ headers }) => {
      fn(headers);
    });

    const invoker = createRpcInvoker(node);
    const call: RpcCall<string, RpcHeaders> = [
      [],
      "test",
      1 as RpcCallId,
      { foo: 42 },
    ];
    await invoker(call, undefined);
    expect(fn).toHaveBeenCalledWith({ foo: 42 });
  });
});
