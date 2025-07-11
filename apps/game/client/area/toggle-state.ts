import { useState } from "react";

export function toggleState(initialValue = false) {
  const [value, setValue] = useState(initialValue);

  function toggle() {
    setValue((prev) => !prev);
  }

  return [value, toggle] as const;
}
