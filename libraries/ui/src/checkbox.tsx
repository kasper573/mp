import type { JSX } from "preact";
import type { Signal } from "@mp/state";

export type CheckboxState = true | false | "indeterminate";

export interface CheckboxProps extends Pick<
  JSX.IntrinsicElements["input"],
  "className" | "style" | "disabled" | "children"
> {
  signal: Signal<CheckboxState>;
}

export function Checkbox({ signal, ...props }: CheckboxProps) {
  return (
    <input
      type="checkbox"
      checked={signal.value === true}
      // oxlint-disable-next-line no-unknown-property
      indeterminate={signal.value === "indeterminate"}
      onChange={(e) => {
        signal.value = e.currentTarget.checked;
      }}
      {...props}
    />
  );
}
