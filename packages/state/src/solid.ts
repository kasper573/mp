import { atom } from "nanostores";
import { createEffect, onCleanup } from "solid-js";
import { useStore } from "@nanostores/solid";
import type { ReadonlyAtom } from "./atom";
import type { ReactiveStorage } from "./create-storage";

export { useStore as useAtom } from "@nanostores/solid";

/**
 * This is an anti-pattern that should only be used while we're transitioning away from solid-js signals.
 * @deprecated
 */
export function useSignalAsAtom<T>(signal: () => T): ReadonlyAtom<T> {
  const signalAsAtom = atom(signal());
  createEffect(() => signalAsAtom.set(signal()));
  return signalAsAtom;
}

export function useStorage<T>(storage: ReactiveStorage<T>) {
  const value = useStore(storage.value);
  onCleanup(storage.effect());
  function setValue(createNextValue: (currentValue: T) => T) {
    storage.value.set(createNextValue(storage.value.get()));
  }
  return [value, setValue] as const;
}
