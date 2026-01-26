import { createSignal } from "solid-js";

export function useToggleState(initialValue = false) {
  const [value, setValue] = createSignal(initialValue);
  const toggle = () => setValue((prev) => !prev);
  return [value, toggle] as const;
}
