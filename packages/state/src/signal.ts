import * as solid from "solid-js";

export interface ReadonlySignal<Value> {
  get: () => Value;
}

export interface Signal<Value> extends ReadonlySignal<Value> {
  set: (value: Value | ((prev: Value) => Value)) => void;
}

export interface NotifyableSignal<Value> extends ReadonlySignal<Value> {
  notify: () => void;
}

export type SignalValue<T extends ReadonlySignal<unknown>> =
  T extends ReadonlySignal<infer Value> ? Value : never;

export function signal<Value>(initialValue: Value): Signal<Value> {
  const [get, set] = solid.createSignal(initialValue);
  return {
    get,
    set,
  };
}

export function notifyableSignal<Value>(
  initialValue: Value,
): NotifyableSignal<Value> {
  const value = signal(initialValue);
  const epoch = signal(0);
  return {
    get: () => {
      epoch.get(); // Add epoch to dependency to ensure signal updates when notified
      return value.get();
    },
    notify: () => {
      epoch.set((n) => n + 1);
    },
  };
}

/**
 * Creates an effect in the current tracking context.
 */
export function effect(handler: () => unknown): void {
  solid.createEffect(handler);
}

export function disposableEffect(handler: () => unknown): () => void {
  return solid.createRoot((dispose) => {
    solid.createEffect(handler);
    return dispose;
  });
}

export function computed<Return>(
  handler: () => Return,
): ReadonlySignal<Return> {
  return { get: handler };
}
