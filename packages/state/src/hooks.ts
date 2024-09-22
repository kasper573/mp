import { type Signal } from "@preact/signals-core";
import {
  useComputed,
  installAutoSignalTracking,
} from "@preact/signals-react/runtime";

installAutoSignalTracking();

export function useSignal<T>(signal: Signal<T>): T {
  return signal.value;
}

export function useComputedValue<T>(fn: () => T): T {
  return useComputed(fn).value;
}

export { useComputed, useSignalEffect } from "@preact/signals-react";
