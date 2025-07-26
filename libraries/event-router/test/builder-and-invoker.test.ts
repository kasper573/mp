import { describe, it, expect, vi } from "vitest";
import type { EventRouterMessage } from "../src";
import {
  EventRouterBuilder,
  createEventInvoker,
  EventRouterInvokerError,
} from "../src";

describe("builder and invoker", () => {
  it("invokes a query event and returns Ok with output", async () => {
    const fn = vi.fn();
    const builder = new EventRouterBuilder().build();
    const node = builder.event
      .input<number>()
      .handler(({ input }) => fn(input * 2));

    const invoker = createEventInvoker(node);
    const call: EventRouterMessage<number> = [[], 5];
    const result = await invoker(call, undefined);

    expect(result.isOk()).toBe(true);
    expect(fn).toHaveBeenCalledWith(10);
  });

  it("passes the context to the handler", async () => {
    interface Ctx {
      value: number;
    }
    const builder = new EventRouterBuilder<Ctx>().build();
    const fn = vi.fn();
    const node = builder.event.handler(({ ctx }) => fn(ctx.value * 3));

    const invoker = createEventInvoker(node);
    const call: EventRouterMessage<unknown> = [[], undefined];
    const result = await invoker(call, { value: 4 });

    expect(result.isOk()).toBe(true);

    expect(fn).toHaveBeenCalledWith(12);
  });

  it("resolves nested router paths correctly", async () => {
    const builder = new EventRouterBuilder().build();

    const fn = vi.fn();
    const greet = builder.event
      .input<string>()
      .handler(({ input }) => fn(`Hello, ${input}!`));

    const root = builder.router({ greet });
    const invoker = createEventInvoker(root);
    const call: EventRouterMessage<string> = [["greet"], "Test"];
    const result = await invoker(call, undefined);

    expect(result.isOk()).toBe(true);
    expect(fn).toHaveBeenCalledWith("Hello, Test!");
  });

  it("returns Err when path not found", async () => {
    const builder = new EventRouterBuilder().build();
    const root = builder.router({});
    const invoker = createEventInvoker(root);
    const call: EventRouterMessage<unknown> = [["unknown"], {}];
    const result = await invoker(call, undefined);

    expect(result.isErr()).toBe(true);
    // @ts-expect-error ignore harmless error for lazy property accses
    expect(result.error).toBeInstanceOf(EventRouterInvokerError);
    // @ts-expect-error ignore harmless error for lazy property accses
    expect(result.error.message).toBe('error in event handler "unknown"');
  });

  it("returns Err when path points to a router endpoint", async () => {
    const builder = new EventRouterBuilder().build();

    const nestedRouter = builder.router({
      child: builder.event.handler(() => {}),
    });
    const root = builder.router({ nested: nestedRouter });
    const invoker = createEventInvoker(root);
    const call: EventRouterMessage<unknown> = [["nested"], {}];
    const result = await invoker(call, undefined);

    expect(result.isErr()).toBe(true);
    // @ts-expect-error ignore harmless error for lazy property accses
    expect(result.error).toBeInstanceOf(EventRouterInvokerError);
    // @ts-expect-error ignore harmless error for lazy property accses
    expect(result.error.message).toBe('error in event handler "nested"');
  });

  it("catches handler exceptions and returns Err with cause", async () => {
    const builder = new EventRouterBuilder().build();

    const brokenProc = builder.event.handler(() => {
      throw new Error("Unexpected");
    });

    const root = builder.router({ broken: brokenProc });
    const invoker = createEventInvoker(root);
    const call: EventRouterMessage<unknown> = [["broken"], {}];
    const result = await invoker(call, undefined);

    expect(result.isErr()).toBe(true);
    // @ts-expect-error ignore harmless error for lazy property accses
    expect(result.error).toBeInstanceOf(EventRouterInvokerError);
    // @ts-expect-error ignore harmless error for lazy property accses
    expect(result.error.cause).toBeInstanceOf(Error);
    // @ts-expect-error ignore harmless error for lazy property accses
    expect((result.error.cause as Error).message).toBe("Unexpected");
  });

  it("allows middleware to provide a custom context to the handler", async () => {
    interface Ctx {
      userId: number;
    }
    const builder = new EventRouterBuilder<Ctx>().build();
    const fn = vi.fn();
    const node = builder.event
      .use(builder.middleware(() => ({ role: "admin" })))
      .handler(({ ctx, mwc }) =>
        fn({
          userId: ctx.userId,
          role: mwc.role,
        }),
      );

    const invoker = createEventInvoker(node);
    const call: EventRouterMessage<unknown> = [[], undefined];
    const result = await invoker(call, { userId: 7 });

    expect(result.isOk()).toBe(true);
    expect(fn).toHaveBeenCalledWith({ userId: 7, role: "admin" });
  });

  it("can use two middlewares and pass combined contexts", async () => {
    interface Ctx {
      userId: number;
    }
    const builder = new EventRouterBuilder<Ctx>().build();
    const fn = vi.fn();
    const node = builder.event
      .use(builder.middleware(() => ({ role: "user" })))
      .use(
        builder.middleware(({ mwc }) => ({
          ...(mwc as object),
          level: "admin",
        })),
      )
      .handler(({ ctx, mwc }) => fn({ userId: ctx.userId, ...mwc }));

    const invoker = createEventInvoker(node);
    const call: EventRouterMessage<unknown> = [[], undefined];
    const result = await invoker(call, { userId: 42 });

    expect(result.isOk()).toBe(true);
    expect(fn).toHaveBeenCalledWith({
      userId: 42,
      role: "user",
      level: "admin",
    });
  });

  it("can use a piped middleware", async () => {
    const builder = new EventRouterBuilder().build();

    const baseMw = builder.middleware(() => ({ count: 1 }));
    const pipedMw = baseMw.pipe(({ mwc }) => ({ count: mwc.count + 1 }));
    const fn = vi.fn();
    const node = builder.event.use(pipedMw).handler(({ mwc }) => fn(mwc.count));

    const invoker = createEventInvoker(node);
    const call: EventRouterMessage<unknown> = [[], undefined];
    const result = await invoker(call, undefined);

    expect(result.isOk()).toBe(true);
    expect(fn).toHaveBeenCalledWith(2);
  });

  it("supports chaining multiple .input steps in any order", async () => {
    const builder = new EventRouterBuilder().build();
    const fn = vi.fn();
    const node = builder.event
      .input<boolean>()
      .input<string>()
      .handler(({ input }) => fn(input.length));

    const invoker = createEventInvoker(node);
    const call: EventRouterMessage<string> = [[], "hello"];
    const result = await invoker(call, undefined);

    expect(result.isOk()).toBe(true);
    expect(fn).toHaveBeenCalledWith(5);
  });
});
