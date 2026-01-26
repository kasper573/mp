import {
  createSignal,
  createEffect,
  createMemo,
  untrack,
  batch as solidBatch,
  onCleanup,
  type Accessor,
  createRoot,
} from "solid-js";

export interface ReadonlySignal<T> {
  get(): T;
  peek(): T;
  subscribe(fn: (value: T) => void): () => void;
}

export class Signal<T> implements ReadonlySignal<T> {
  protected _get: Accessor<T>;
  protected _set: (v: T) => void;

  constructor(initialValue: T) {
    const [get, set] = createSignal(initialValue);
    this._get = get;
    this._set = set;
  }

  get(): T {
    return this._get();
  }

  set(newValue: T): void {
    (this._set as (v: T) => void)(newValue);
  }

  peek(): T {
    return untrack(this._get);
  }

  subscribe(fn: (value: T) => void): () => void {
    let dispose: (() => void) | undefined;
    createRoot((d: () => void) => {
      dispose = d;
      createEffect(() => {
        fn(this._get());
      });
    });
    return () => dispose?.();
  }
}

export function signal<T>(initialValue: T): Signal<T> {
  return new Signal(initialValue);
}

export function computed<T>(fn: () => T): ReadonlySignal<T> {
  // Create the memo inside a root so it has an owner
  // Use a wrapper approach: memo for tracking + signal for external access
  const [getValue, setValue] = createSignal<T>(fn());

  createRoot(() => {
    // Create a memo that tracks fn's dependencies
    const memo = createMemo(fn);

    // Create an effect that updates the signal when memo changes
    createEffect(() => {
      const value = memo();
      setValue(() => value);
    });
  });

  return {
    get: getValue,
    peek: () => untrack(getValue),
    subscribe(callback: (value: T) => void): () => void {
      let disposeSubscription: (() => void) | undefined;
      createRoot((d: () => void) => {
        disposeSubscription = d;
        createEffect(() => {
          callback(getValue());
        });
      });
      return () => disposeSubscription?.();
    },
  };
}

export function effect(fn: () => void | (() => void)): () => void {
  let dispose: (() => void) | undefined;
  createRoot((d: () => void) => {
    dispose = d;
    createEffect(() => {
      const cleanup = fn();
      if (typeof cleanup === "function") {
        onCleanup(cleanup);
      }
    });
  });
  return () => dispose?.();
}

export { untrack as untracked } from "solid-js";

export const batch = solidBatch;
