import type { ReadonlySignal } from "@mp/state";
import { useSignal } from "@mp/state/solid";
import { createEffect } from "solid-js";

/**
 * This hook will treat all property values of the given object as dependencies and update a signal with the object on change.
 * The function is re-evaluated whenever any reactive values read inside it change.
 */
export function useObjectSignal<T extends object>(
  getObj: () => T,
): ReadonlySignal<T> {
  const signal = useSignal<T>(getObj());

  createEffect(() => {
    const obj = getObj(); // Tracks all reactive reads inside getObj
    // Must shallow copy for signal to accept the new value as different
    signal.set({ ...obj });
  });

  return signal;
}
