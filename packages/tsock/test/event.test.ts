import { it, expect, vi } from "vitest";
import { createEventBus } from "../src/event";

it("it can send events", () => {
  const handler = vi.fn();

  const bus = createEventBus(handler);

  bus.message();
  expect(handler).toBeCalled();
});

it("can send arbitrary number of event arguments", () => {
  const handler = vi.fn();

  const bus = createEventBus(handler);

  bus.message("foo", 123, false);
  expect(handler).toHaveBeenCalledWith("message", "foo", 123, false);
});

it("can subscribe to incoming events", () => {
  let send: (eventName: string, ...args: unknown[]) => void = () => {};

  const bus = createEventBus(noop, (fn) => {
    send = fn;
    return () => {};
  });

  const receiver = vi.fn();
  bus.foo.subscribe(receiver);
  send("foo");
  expect(receiver).toHaveBeenCalled();
});

it("does not trigger callback for events not suscribed to", () => {
  let send: (eventName: string, ...args: unknown[]) => void = () => {};

  const bus = createEventBus(noop, (fn) => {
    send = fn;
    return () => {};
  });

  const receiver = vi.fn();
  bus.foo.subscribe(receiver);
  send("other");
  expect(receiver).not.toHaveBeenCalled();
});

it("can receive arbitrary number of event arguments from incoming events", () => {
  let send: (
    eventName: string,
    str: string,
    n: number,
    b: boolean,
  ) => void = () => {};

  const bus = createEventBus(noop, (fn) => {
    send = fn;
    return () => {};
  });

  const receiver = vi.fn();
  bus.message.subscribe(receiver);
  send("message", "foo", 123, false);
  expect(receiver).toHaveBeenCalledWith("foo", 123, false);
});

it("can unsubscribe from incoming event", () => {
  let send: (eventName: string) => void = () => {};

  const bus = createEventBus(noop, (fn) => {
    send = fn;
    return () => {
      send = () => {};
    };
  });

  const receiver = vi.fn();
  const unsub = bus.foo.subscribe(receiver);
  unsub();
  send("foo");
  expect(receiver).not.toHaveBeenCalled();
});

it("using the same incoming event handler multiple times still becomes multiple subscriptions", () => {
  const callbacks = new Array<(eventName: string) => void>();

  const bus = createEventBus(noop, (fn) => {
    callbacks.push(fn);
    return () => {};
  });

  const receiver = vi.fn();
  bus.foo.subscribe(receiver);
  bus.foo.subscribe(receiver);
  bus.foo.subscribe(receiver);
  for (const send of callbacks) {
    send("foo");
  }
  expect(receiver).toBeCalledTimes(3);
});

it("can subscribe to all incoming events", () => {
  let send = (eventName: string, ...args: unknown[]) => {};

  const bus = createEventBus(noop, (fn) => {
    send = fn;
    return () => {};
  });

  const receiver = vi.fn();
  bus.$subscribe(receiver);
  send("foo", 1);
  expect(receiver).toHaveBeenCalledTimes(1);
  expect(receiver).toHaveBeenLastCalledWith({ name: "foo", args: [1] });
  send("bar", false);
  expect(receiver).toHaveBeenCalledTimes(2);
  expect(receiver).toHaveBeenLastCalledWith({
    name: "bar",
    args: [false],
  });
});

it("can unsubscribe after subscribing to all incoming events", () => {
  let send = (eventName: string, ...args: unknown[]) => {};

  const bus = createEventBus(noop, (fn) => {
    send = fn;
    return () => {
      send = () => {};
    };
  });

  const receiver = vi.fn();
  const stop = bus.$subscribe(receiver);
  stop();
  send("foo");
  send("bar");
  expect(receiver).not.toHaveBeenCalled();
});

const noop = () => {};