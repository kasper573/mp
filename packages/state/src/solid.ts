import { onCleanup } from "solid-js";
import { useStore } from "@nanostores/solid";
import type { ReactiveStorage } from "./create-storage";

/**
 * Temporary deprecation to help me understand what code to remove to decouple pixi.js from solid-js.
 * @deprecated
 */
export const useAtom = useStore;

export function useStorage<T>(storage: ReactiveStorage<T>) {
  const value = useStore(storage.value);
  onCleanup(storage.effect());
  function setValue(createNextValue: (currentValue: T) => T) {
    storage.value.set(createNextValue(storage.value.get()));
  }
  return [value, setValue] as const;
}
