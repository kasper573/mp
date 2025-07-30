import { useCallback, useState } from "preact/hooks";

export function useToggleState(initialValue = false) {
  const [value, setValue] = useState(initialValue);
  const toggle = useCallback(() => setValue((prev) => !prev), []);
  return [value, toggle] as const;
}
