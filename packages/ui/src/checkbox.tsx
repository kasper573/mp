import type { JSX } from "preact";
import type { Signal } from "@mp/state";

export interface CheckboxProps
  extends Pick<
    JSX.IntrinsicElements["input"],
    "className" | "style" | "disabled" | "children"
  > {
  signal: Signal<boolean>;
}

export function Checkbox({ signal, ...props }: CheckboxProps) {
  return (
    <input
      type="checkbox"
      checked={signal.value}
      onChange={(e) => {
        signal.value = e.currentTarget.checked;
      }}
      {...props}
    />
  );
}
