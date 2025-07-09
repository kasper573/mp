import type { Accessor } from "solid-js";
import { createEffect, createSignal, onCleanup } from "solid-js";
import type { StorageAdapter } from "./storage/storage-adapter";
import {
  getObservableValue,
  type ObservableLike,
  type ObservableValue,
} from "./observable";

export function useObservable<Value>(
  observable: Accessor<ObservableLike<Value>> | ObservableLike<Value>,
): Accessor<Value> {
  const [value, setValue] = createSignal(
    getObservableValue(accessObservable()),
    { equals: isSameObservableValue },
  );

  function accessObservable() {
    return typeof observable === "function" ? observable() : observable;
  }

  createEffect(() => {
    onCleanup(accessObservable().subscribe(setValue));
  });

  return value;
}

export function useObservables<Observables extends ObservableLike<unknown>[]>(
  ...observables: Observables
): ObservableAccessors<Observables> {
  return observables.map((obs) => useObservable(() => obs)) as never;
}

export function useStorage<T>(storage: StorageAdapter<T>) {
  const [value, setValue] = createSignal<T>(storage.load());
  createEffect(() => storage.save(value()));
  return [value, setValue] as const;
}

type ObservableAccessors<Observables extends ObservableLike<unknown>[]> = {
  [Index in keyof Observables]: Accessor<ObservableValue<Observables[Index]>>;
};

// The observable uses a notification system that should be trusted implicitly.
// If a change is notified, we always trust and accept the new value, even if the new value is the same object instance.
// This is because we rely on mutations and the same instance has received mutations when a notification is received.
// We can still equality check primitives though.
function isSameObservableValue(a: unknown, b: unknown) {
  if (isPrimitive(a) && isPrimitive(b)) {
    return a === b;
  }
  return false;
}

function isPrimitive(value: unknown): boolean {
  return (
    value === null ||
    value === undefined ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  );
}
