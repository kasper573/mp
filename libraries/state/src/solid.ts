import { createEffect, onCleanup } from "solid-js";
import { type Signal, signal, computed, type ReadonlySignal } from "./signal";

/**
 * Create a signal for use in SolidJS components.
 * The signal is a core signal that works the same everywhere.
 */
export function useSignal<T>(initialValue: T): Signal<T> {
  return signal(initialValue);
}

/**
 * Create a computed signal for use in SolidJS components.
 * Uses the core computed function which works the same everywhere.
 */
export function useComputed<T>(fn: () => T): ReadonlySignal<T> {
  return computed(fn);
}

/**
 * Run an effect in a SolidJS component context.
 * The effect is tied to the component lifecycle and cleaned up when the component unmounts.
 */
export function useSignalEffect(fn: () => void | (() => void)): void {
  createEffect(() => {
    const cleanup = fn();
    if (cleanup) {
      onCleanup(cleanup);
    }
  });
}
