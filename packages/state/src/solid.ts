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
    {
      // The observable uses a notification system that should be trusted implicitly.
      // If a change is notified, we always trust and accept the new value, without equality checks.
      equals: never,
    },
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

function never() {
  return false;
}
