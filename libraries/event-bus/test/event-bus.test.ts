import { describe, expect, it, vi } from "vitest";
import { event, EventBus } from "../src";

describe("event-bus", () => {
  it("event handlers can receive events", () => {
    const test = event("test").payload<{ foo: string }>().build();
    const bus = new EventBus(null);
    let received: unknown;
    bus.onAny((e) => (received = e));
    bus.emit(test({ foo: "bar" }));
    expect(received).toEqual({ type: "test", payload: { foo: "bar" } });
  });

  it("event handlers can receive state", () => {
    const test = event("test").build();
    const state = { value: 42 };
    const bus = new EventBus(state);
    let received: unknown;
    bus.onAny((_, s) => (received = s));
    bus.emit(test());
    expect(received).toBe(state);
  });

  it("event handlers can receive event bus instance", () => {
    const test = event("test").build();
    const state = { value: 42 };
    const bus = new EventBus(state);
    let received: unknown;
    bus.onAny((_1, _2, b) => (received = b));
    bus.emit(test());
    expect(received).toBe(bus);
  });

  it("event handlers can be registered for specific event definitions", () => {
    const test = event("test").payload<{ foo: string }>().build();
    const bus = new EventBus(null);
    const spy = vi.fn();
    bus.on(test, spy);
    bus.emit(test({ foo: "bar" }));
    expect(spy).toHaveBeenCalledWith(
      { type: "test", payload: { foo: "bar" } },
      null,
      bus,
    );
  });

  it("event definitions do not require payload", () => {
    const test = event("test").build();
    const bus = new EventBus(null);
    const spy = vi.fn();
    bus.on(test, spy);
    bus.emit(test());
    expect(spy).toHaveBeenCalledWith(
      { type: "test", payload: undefined },
      null,
      bus,
    );
  });

  it("can unsubscribe from onAny()", () => {
    const test = event("test").build();
    const machine = new EventBus(null);
    const spy = vi.fn();
    const unsubscribe = machine.onAny(spy);
    machine.emit(test());
    unsubscribe();
    machine.emit(test());
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("can unsubscribe from on()", () => {
    const test = event("test").build();
    const machine = new EventBus(null);
    const spy = vi.fn();
    const unsubscribe = machine.on(test, spy);
    machine.emit(test());
    unsubscribe();
    machine.emit(test());
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
