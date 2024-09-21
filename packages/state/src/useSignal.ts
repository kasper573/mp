import type { Signal } from "@preact/signals-core";
import { useCallback, useEffect, useState } from "react";

export function useSignal<T>(signal: Signal<T>): [T, (value: T) => void] {
  const [value, setValueInComponent] = useState(signal.value);
  useEffect(() => signal.subscribe(setValueInComponent), [signal]);
  const setValue = useCallback((value: T) => (signal.value = value), [signal]);
  return [value, setValue];
}
