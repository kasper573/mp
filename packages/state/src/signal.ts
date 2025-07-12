import * as preact from "@preact/signals-core";

export interface ReadonlySignal<Value> {
  get: () => Value;
}

export interface Signal<Value> extends ReadonlySignal<Value> {
  set: (value: Value) => void;
}

export interface NotifyableSignal<Value> extends ReadonlySignal<Value> {
  notify: () => void;
}

export type SignalValue<T extends ReadonlySignal<unknown>> =
  T extends ReadonlySignal<infer Value> ? Value : never;

type UnsubscribeFn = () => void;

export function signal<Value>(initialValue: Value): Signal<Value> {
  const signal = preact.signal(initialValue);
  return {
    get: () => signal.value,
    set: (newValue) => {
      signal.value = newValue;
    },
  };
}

export function notifyableSignal<Value>(
  initialValue: Value,
): NotifyableSignal<Value> {
  const signal = preact.signal(initialValue);
  const epoch = preact.signal(0);
  return {
    get: () => {
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
      epoch.value; // Add epoch to dependency to ensure signal updates when notified
      return signal.value;
    },
    notify: () => {
      epoch.value++;
    },
  };
}

export function effect(handler: () => unknown): UnsubscribeFn {
  return preact.effect(() => void handler());
}

export function computed<Return>(
  handler: () => Return,
): ReadonlySignal<Return> {
  const signal = preact.computed(handler);
  return { get: () => signal.value };
}
