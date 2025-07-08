import type { Accessor } from "solid-js";
import { createEffect, createSignal, onCleanup } from "solid-js";
import type { ReactiveStorage } from "./create-storage";
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
): {
  [Index in keyof Observables]: Accessor<ObservableValue<Observables[Index]>>;
} {
  return observables.map(useObservable) as never;
}

export function useStorage<T>(storage: ReactiveStorage<T>) {
  const value = useObservable(storage.value);

  createEffect(() => {
    onCleanup(storage.effect());
  });

  function setValue(createNextValue: (currentValue: T) => T) {
    storage.value.set(createNextValue(storage.value.get()));
  }
  return [value, setValue] as const;
}
