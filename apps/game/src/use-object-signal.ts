import type { ReadonlySignal } from "@mp/state";
import { useSignal } from "@mp/state/react";
import { useEffect } from "preact/hooks";

/**
 * This hook will treat all property values of the given object as dependencies and update a signal with the object on change.
 */
export function useObjectSignal<T extends object>(obj: T): ReadonlySignal<T> {
  const signal = useSignal<T>(obj);

  useEffect(() => {
    // Must shallow copy for signal to accept the new value as different
    signal.value = { ...obj };
    // oxlint-disable-next-line exhaustive-deps
  }, Object.values(obj));

  return signal;
}
