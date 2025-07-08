import type { Accessor } from "solid-js";
import { createSignal, onCleanup } from "solid-js";
import type { ReactiveStorage } from "./create-storage";
import type { ReadonlyObservable } from "./observable";

/**
 * Temporary deprecation to help me understand what code to remove to decouple pixi.js from solid-js.
 * TODO rename to useObservable
 * @deprecated
 */
export function useAtom<Value>(
  observable: ReadonlyObservable<Value>,
): Accessor<Value> {
  const [value, setValue] = createSignal(observable.get());
  onCleanup(observable.subscribe(setValue));
  return value;
}

export function useStorage<T>(storage: ReactiveStorage<T>) {
  const value = useAtom(storage.value);
  onCleanup(storage.effect());
  function setValue(createNextValue: (currentValue: T) => T) {
    storage.value.set(createNextValue(storage.value.get()));
  }
  return [value, setValue] as const;
}
