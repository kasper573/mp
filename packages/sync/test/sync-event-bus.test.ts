import { describe, it, expect, vi, beforeEach } from "vitest";
import { SyncEventBus } from "../src/sync-event";

interface TestEvents {
  foo: number;
  bar: { x: string };
  baz: undefined;
}

describe("SyncEventBus", () => {
  let bus: SyncEventBus<TestEvents>;

  beforeEach(() => {
    bus = new SyncEventBus<TestEvents>();
  });

  it("calls a subscribed handler with the correct payload", () => {
    const handler = vi.fn<(payload: number) => void>();
    bus.subscribe("foo", handler);
    bus.dispatch(["foo", 123]);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(123);
  });

  it("passes undefined if payload is omitted", () => {
    const handler = vi.fn<(payload: undefined) => void>();
    bus.subscribe("baz", handler);
    // dispatch without explicit payload
    bus.dispatch(["baz"]);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(undefined);
  });

  it("supports multiple handlers for the same event", () => {
    const h1 = vi.fn<(payload: number) => void>();
    const h2 = vi.fn<(payload: number) => void>();
    bus.subscribe("foo", h1);
    bus.subscribe("foo", h2);
    bus.dispatch(["foo", 5]);
    expect(h1).toHaveBeenCalledOnce();
    expect(h2).toHaveBeenCalledOnce();
  });

  it("removes handler when unsubscribe is called", () => {
    const handler = vi.fn<(p: number) => void>();
    const unsub = bus.subscribe("foo", handler);
    bus.dispatch(["foo", 1]);
    expect(handler).toHaveBeenCalledTimes(1);

    unsub();
    bus.dispatch(["foo", 2]);
    expect(handler).toHaveBeenCalledTimes(1); // no new calls
  });

  it("unsubscribe is idempotent", () => {
    const handler = vi.fn<(p: number) => void>();
    const unsub = bus.subscribe("foo", handler);
    unsub();
    // second call does nothing / no error
    expect(() => unsub()).not.toThrow();
  });

  it("does not call handlers for other events", () => {
    const fooHandler = vi.fn();
    const barHandler = vi.fn();
    bus.subscribe("foo", fooHandler);
    bus.subscribe("bar", barHandler);
    bus.dispatch(["foo", 99]);
    expect(fooHandler).toHaveBeenCalledOnce();
    expect(barHandler).not.toHaveBeenCalled();
  });

  it("does nothing if dispatching an event with no handlers", () => {
    // no subscriptions at all
    expect(() => bus.dispatch(["foo", 0])).not.toThrow();
  });

  it("treats duplicate handler subscriptions as one (Set)", () => {
    const handler = vi.fn<(p: number) => void>();
    // “Subscribe twice” – only one entry in the Set
    bus.subscribe("foo", handler);
    bus.subscribe("foo", handler);
    bus.dispatch(["foo", 7]);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("propagates errors thrown by handlers (and stops further handlers)", () => {
    const boom = vi.fn(() => {
      throw new Error("fail");
    });
    const after = vi.fn();
    bus.subscribe("foo", boom);
    bus.subscribe("foo", after);
    expect(() => bus.dispatch(["foo", 0])).toThrow("fail");
    // the second handler should not be called
    expect(after).not.toHaveBeenCalled();
  });

  it("supports object payloads correctly", () => {
    const handler = vi.fn<(p: { x: string }) => void>();
    bus.subscribe("bar", handler);
    const payload = { x: "hello" };
    bus.dispatch(["bar", payload]);
    expect(handler).toHaveBeenCalledWith(payload);
  });

  it("handlers added after a dispatch still receive future events", () => {
    const early = vi.fn();
    bus.dispatch(["foo", 10]); // no-op
    bus.subscribe("foo", early);
    bus.dispatch(["foo", 20]);
    expect(early).toHaveBeenCalledWith(20);
  });
});
