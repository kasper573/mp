import type { Accessor } from "solid-js";
import { createEffect, createSignal, onCleanup } from "solid-js";
import type { StorageAdapter } from "./storage-adapter";
import {
  getObservableValue,
  type ObservableLike,
  type ObservableValue,
} from "./observable";

export function useObservable<Value>(
  observable: ObservableLike<Value>,
): Accessor<Value> {
  const [value, setValue] = createSignal(getObservableValue(observable));
  createEffect(() => {
    onCleanup(observable.subscribe(setValue));
  });
  return value;
}

export function useObservables<Observables extends ObservableLike<unknown>[]>(
  ...observables: Observables
): ObservableAccessors<Observables> {
  return observables.map(useObservable) as never;
}

export function useStorage<T>(storage: StorageAdapter<T>) {
  const [value, setValue] = createSignal<T>(storage.load());
  createEffect(() => storage.save(value()));
  return [value, setValue] as const;
}

type ObservableAccessors<Observables extends ObservableLike<unknown>[]> = {
  [Index in keyof Observables]: Accessor<ObservableValue<Observables[Index]>>;
};
