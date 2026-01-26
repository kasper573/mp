import {
  createMemo as solidCreateMemo,
  createEffect as solidCreateEffect,
  onCleanup,
} from "solid-js";
import { signal, type Signal } from "./signal";

// Re-export SolidJS hooks with names similar to old preact/signals hooks
// for easier migration

export function useSignal<T>(initialValue: T): Signal<T> {
  return signal<T>(initialValue);
}

export function useComputed<T>(fn: () => T) {
  return solidCreateMemo(fn);
}

export function useSignalEffect(fn: () => void | (() => void)) {
  solidCreateEffect(() => {
    const cleanup = fn();
    if (typeof cleanup === "function") {
      onCleanup(cleanup);
    }
  });
}
