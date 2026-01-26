import type { ReadonlySignal } from "@mp/state";
import { signal } from "@mp/state";
import { createEffect } from "solid-js";

/**
 * This hook will treat all property values of the given object as dependencies and update a signal with the object on change.
 */
export function useObjectSignal<T extends object>(obj: T): ReadonlySignal<T> {
  const sig = signal<T>(obj);

  createEffect(() => {
    // Read all values to create dependencies
    Object.values(obj);
    // Must shallow copy for signal to accept the new value as different
    sig.set({ ...obj });
  });

  return sig;
}
