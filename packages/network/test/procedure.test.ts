import { it, expect, vi } from "vitest";
import type { CallFn } from "../src/dispatcher";
import { createDispatcher } from "../src/dispatcher";

it("it can call procedures", () => {
  const handler = vi.fn();

  const d = createDispatcher(handler);

  d.message();
  expect(handler).toBeCalled();
});

it("can call procedure with arbitrary number of arguments", () => {
  const handler = vi.fn();

  const d = createDispatcher(handler);

  d.message("foo", 123, false);
  expect(handler).toHaveBeenCalledWith("message", "foo", 123, false);
});

it("can subscribe to incoming procedure calls", () => {
  let send: (...args: unknown[]) => void = () => {};

  const d = createDispatcher(noop, (_, fn) => {
    send = fn;
    return () => {};
  });

  const receiver = vi.fn();
  d.foo.subscribe(receiver);
  send("foo");
  expect(receiver).toHaveBeenCalled();
});

it("subscribe function receives procedure name", () => {
  const send: (...args: unknown[]) => void = () => {};

  const d = createDispatcher(noop, (name) => {
    expect(name as string).toEqual("foo");
    return () => {};
  });

  const receiver = vi.fn();
  d.foo.subscribe(receiver);
  send("other");
});

it("can receive arbitrary number of procedure arguments from incoming procedure calls", () => {
  let send: (str: string, n: number, b: boolean) => void = () => {};

  const d = createDispatcher(noop, (_, fn) => {
    send = fn;
    return () => {};
  });

  const receiver = vi.fn();
  d.message.subscribe(receiver);
  send("foo", 123, false);
  expect(receiver).toHaveBeenCalledWith("foo", 123, false);
});

it("can unsubscribe from incoming procedure call", () => {
  let send: () => void = () => {};

  const d = createDispatcher(noop, (_, fn) => {
    send = fn;
    return () => {
      send = () => {};
    };
  });

  const receiver = vi.fn();
  const unsub = d.foo.subscribe(receiver);
  unsub();
  send();
  expect(receiver).not.toHaveBeenCalled();
});

it("using the same incoming procedure call handler multiple times still becomes multiple subscriptions", () => {
  const callbacks = new Array<(procedureName: string) => void>();

  const d = createDispatcher(noop, (_, fn) => {
    callbacks.push(fn);
    return () => {};
  });

  const receiver = vi.fn();
  d.foo.subscribe(receiver);
  d.foo.subscribe(receiver);
  d.foo.subscribe(receiver);
  for (const send of callbacks) {
    send("foo");
  }
  expect(receiver).toBeCalledTimes(3);
});

const noop = (async () => {}) as CallFn;
