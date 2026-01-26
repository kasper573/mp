import { createSignal, type Accessor } from "solid-js";

export function useToggleState(
  initialValue = false,
): [Accessor<boolean>, () => void] {
  const [value, setValue] = createSignal(initialValue);
  const toggle = () => setValue((prev) => !prev);
  return [value, toggle];
}
