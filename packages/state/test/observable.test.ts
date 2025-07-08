import { describe, it, expect, vi } from "vitest";
import { mutableObservable } from "../src/observable";

describe("observable", () => {
  it("can get initial value", () => {
    const obs = mutableObservable(1);
    expect(obs.$getObservableValue()).toBe(1);
  });

  it("can get changed value", () => {
    const obs = mutableObservable(1);
    obs.set(2);
    expect(obs.$getObservableValue()).toBe(2);
  });

  it("does not notify immediately on subscription", () => {
    const obs = mutableObservable(1);
    const handler = vi.fn();
    obs.subscribe(handler);
    expect(handler).not.toHaveBeenCalled();
  });

  it("calls onMount only for first subscriber and onCleanup only after last unsubscribes", () => {
    const onMount = vi.fn();
    const onCleanup = vi.fn();
    const obs = mutableObservable(0, onMount, onCleanup);
    const h1 = vi.fn();
    const h2 = vi.fn();
    expect(onMount).not.toHaveBeenCalled();
    const unsub1 = obs.subscribe(h1);
    expect(onMount).toHaveBeenCalledTimes(1);
    const unsub2 = obs.subscribe(h2);
    expect(onMount).toHaveBeenCalledTimes(1);
    unsub2();
    expect(onCleanup).not.toHaveBeenCalled();
    unsub1();
    expect(onCleanup).toHaveBeenCalledTimes(1);
  });

  it("notifies subscribers on value change", () => {
    const obs = mutableObservable(1);
    const handler = vi.fn();
    obs.subscribe(handler);
    obs.set(2);
    expect(handler).toHaveBeenCalledWith(2);
  });

  it("unsubscribe stops further notifications", () => {
    const obs = mutableObservable(0);
    const handler = vi.fn();
    const unsub = obs.subscribe(handler);
    handler.mockClear();
    unsub();
    obs.set(1);
    expect(handler).not.toHaveBeenCalled();
  });

  it("unsubscribe twice does not trigger cleanup twice", () => {
    const onCleanup = vi.fn();
    const obs = mutableObservable(0, undefined, onCleanup);
    const handler = vi.fn();
    const unsub = obs.subscribe(handler);
    unsub();
    unsub();
    expect(onCleanup).toHaveBeenCalledTimes(1);
  });
});

describe("derive", () => {
  it("can get initial derived value", () => {
    const obs = mutableObservable(2);
    const derived = obs.derive((x) => x * 3);
    expect(derived.$getObservableValue()).toBe(6);
  });

  it("emits derived value to subscriber when source changes", () => {
    const source = mutableObservable(2);
    const derived = source.derive((x) => x * 3);
    const fn = vi.fn();
    derived.subscribe(fn);
    source.set(4);
    expect(fn).toHaveBeenCalledWith(12);
  });

  it("can get the changed derived value", () => {
    const obs = mutableObservable(0);
    const derived = obs.derive((x) => x * 2);
    obs.set(3);
    expect(derived.$getObservableValue()).toBe(6);
  });
});

describe("compose", () => {
  it("can get initial composed value", () => {
    const obsA = mutableObservable("a");
    const obsB = mutableObservable(1);
    const comp = obsA.compose(obsB);
    expect(comp.$getObservableValue()).toEqual(["a", 1]);
  });

  it("can get the changed composed value", () => {
    const obsA = mutableObservable("a");
    const obsB = mutableObservable(1);
    const comp = obsA.compose(obsB);

    obsA.set("b");
    expect(comp.$getObservableValue()).toEqual(["b", 1]);
    obsB.set(2);
    expect(comp.$getObservableValue()).toEqual(["b", 2]);
  });

  it("manages subscriptions on mount and cleanup", () => {
    const onMountA = vi.fn();
    const onCleanupA = vi.fn();
    const onMountB = vi.fn();
    const onCleanupB = vi.fn();
    const obsA = mutableObservable(1, onMountA, onCleanupA);
    const obsB = mutableObservable(2, onMountB, onCleanupB);
    const comp = obsA.compose(obsB);
    const handler = vi.fn();
    const unsub = comp.subscribe(handler);
    expect(onMountA).toHaveBeenCalledTimes(1);
    expect(onMountB).toHaveBeenCalledTimes(1);
    unsub();
    expect(onCleanupA).toHaveBeenCalledTimes(1);
    expect(onCleanupB).toHaveBeenCalledTimes(1);
  });
});
