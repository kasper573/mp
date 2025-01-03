import { createSignal } from "solid-js";

export function toggleSignal(initialValue = false) {
  const [value, setValue] = createSignal(initialValue);

  function toggle() {
    setValue((prev) => !prev);
  }

  return [value, toggle] as const;
}
