import { type Signal } from "@preact/signals-core";
import { useSignals } from "@preact/signals-react/runtime";
import { useCallback } from "react";
export { useSignalEffect, useComputed } from "@preact/signals-react/runtime";

export function useSignal<T>(signal: Signal<T>): [T, (value: T) => void] {
  useSignals();
  const setValue = useCallback((value: T) => (signal.value = value), [signal]);
  return [signal.value, setValue];
}
