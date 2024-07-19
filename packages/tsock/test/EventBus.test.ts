import { it, expect, vi } from "vitest";
import { createEventBus } from "../src/EventBus";

it("it can send events", () => {
  const message = vi.fn();

  const bus = createEventBus({ message });

  bus.message();
  expect(message).toBeCalled();
});

it("can send arbitrary number of event arguments", () => {
  const message = vi.fn();

  const bus = createEventBus({ message });

  bus.message("foo", 123, false);
  expect(message).toHaveBeenCalledWith("foo", 123, false);
});

it("it does not send events to the wrong target", () => {
  const message = vi.fn();
  const other = vi.fn();

  const bus = createEventBus({ message, other });

  bus.message("hello");
  expect(other).not.toHaveBeenCalled();
});

it("can subscribe to event", () => {
  let send: () => void = () => {};

  const bus = createEventBus(
    {},
    {
      foo: (fn) => {
        send = fn;
        return () => {};
      },
    },
  );

  const receiver = vi.fn();
  bus.foo.subscribe(receiver);
  send();
  expect(receiver).toHaveBeenCalled();
});

it("can receive arbitrary number of event arguments from subscription", () => {
  let send: (str: string, n: number, b: boolean) => void = () => {};

  const bus = createEventBus(
    {},
    {
      foo: (fn) => {
        send = fn;
        return () => {};
      },
    },
  );

  const receiver = vi.fn();
  bus.foo.subscribe(receiver);
  send("foo", 123, false);
  expect(receiver).toHaveBeenCalledWith("foo", 123, false);
});

it("can unsubscribe from event", () => {
  let send: (payload: number) => void = () => {};

  const bus = createEventBus(
    {},
    {
      foo: (fn) => {
        send = fn;
        return () => {
          send = () => {};
        };
      },
    },
  );

  const receiver = vi.fn();
  const unsub = bus.foo.subscribe(receiver);
  unsub();
  send(123);
  expect(receiver).not.toHaveBeenCalled();
});

it("using the same subscription handler multiple times still becomes multiple subscriptions", () => {
  const callbacks = new Array<(payload: number) => void>();

  const bus = createEventBus(
    {},
    {
      foo: (fn) => {
        callbacks.push(fn);
        return () => {};
      },
    },
  );

  const receiver = vi.fn();
  bus.foo.subscribe(receiver);
  bus.foo.subscribe(receiver);
  bus.foo.subscribe(receiver);
  for (const send of callbacks) {
    send(123);
  }
  expect(receiver).toBeCalledTimes(3);
});

it("does not send subscriptions to the wrong target", () => {
  const callbacks = new Map<string, (payload: number) => void>();

  const bus = createEventBus(
    {},
    {
      foo: (fn) => {
        callbacks.set("foo", fn);
        return () => {};
      },
      bar: (fn) => {
        callbacks.set("bar", fn);
        return () => {};
      },
    },
  );

  const receiver = vi.fn();
  bus.foo.subscribe(receiver);

  expect(callbacks.has("foo")).toBeTruthy();
  expect(callbacks.has("bar")).toBeFalsy();
});
