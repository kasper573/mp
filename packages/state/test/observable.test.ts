import { describe, it, expect, vi } from "vitest";
import {
  getObservableValue,
  observable,
  observableValueGetterSymbol,
} from "../src/observable";

describe("observable", () => {
  it("can get initial value", () => {
    const obs = observable(1);
    expect(obs.get()).toBe(1);
  });

  it("can get value from an observable with a symbol based getter", () => {
    const { get, ...rest } = observable(1);
    const obs = {
      ...rest,
      [observableValueGetterSymbol]: get,
    };
    expect(getObservableValue(obs)).toBe(1);
  });

  it("can get changed value", () => {
    const obs = observable(1);
    obs.set(2);
    expect(obs.get()).toBe(2);
  });

  it("does not notify immediately on subscription", () => {
    const obs = observable(1);
    const handler = vi.fn();
    obs.subscribe(handler);
    expect(handler).not.toHaveBeenCalled();
  });

  it("calls onMount only for first subscriber and onCleanup only after last unsubscribes", () => {
    const onMount = vi.fn();
    const onCleanup = vi.fn();
    const obs = observable(0, onMount, onCleanup);
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
    const obs = observable(1);
    const handler = vi.fn();
    obs.subscribe(handler);
    obs.set(2);
    expect(handler).toHaveBeenCalledWith(2);
  });

  it("unsubscribe stops further notifications", () => {
    const obs = observable(0);
    const handler = vi.fn();
    const unsub = obs.subscribe(handler);
    handler.mockClear();
    unsub();
    obs.set(1);
    expect(handler).not.toHaveBeenCalled();
  });

  it("unsubscribe twice does not trigger cleanup twice", () => {
    const onCleanup = vi.fn();
    const obs = observable(0, undefined, onCleanup);
    const handler = vi.fn();
    const unsub = obs.subscribe(handler);
    unsub();
    unsub();
    expect(onCleanup).toHaveBeenCalledTimes(1);
  });
});

describe("derive", () => {
  it("can get initial derived value", () => {
    const obs = observable(2);
    const derived = obs.derive((x) => x * 3);
    expect(derived.get()).toBe(6);
  });

  it("emits derived value to subscriber when source changes", () => {
    const source = observable(2);
    const derived = source.derive((x) => x * 3);
    const fn = vi.fn();
    derived.subscribe(fn);
    source.set(4);
    expect(fn).toHaveBeenCalledWith(12);
  });

  it("can get the changed derived value", () => {
    const obs = observable(0);
    const derived = obs.derive((x) => x * 2);
    obs.set(3);
    expect(derived.get()).toBe(6);
  });
});

describe("compose", () => {
  it("can get initial composed value", () => {
    const obsA = observable("a");
    const obsB = observable(1);
    const comp = obsA.compose(obsB);
    expect(comp.get()).toEqual(["a", 1]);
  });

  it("can get the changed composed value", () => {
    const obsA = observable("a");
    const obsB = observable(1);
    const comp = obsA.compose(obsB);

    obsA.set("b");
    expect(comp.get()).toEqual(["b", 1]);
    obsB.set(2);
    expect(comp.get()).toEqual(["b", 2]);
  });

  it("manages subscriptions on mount and cleanup", () => {
    const onMountA = vi.fn();
    const onCleanupA = vi.fn();
    const onMountB = vi.fn();
    const onCleanupB = vi.fn();
    const obsA = observable(1, onMountA, onCleanupA);
    const obsB = observable(2, onMountB, onCleanupB);
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
