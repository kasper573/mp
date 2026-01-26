import type { JSX } from "solid-js";
import { splitProps, createEffect } from "solid-js";
import type { Signal } from "@mp/state";

export type CheckboxState = true | false | "indeterminate";

export interface CheckboxProps extends Pick<
  JSX.IntrinsicElements["input"],
  "class" | "style" | "disabled" | "children"
> {
  // Accept both Signal<boolean> and Signal<CheckboxState> for flexibility
  signal: Signal<boolean> | Signal<CheckboxState>;
}

export function Checkbox(props: CheckboxProps) {
  const [local, others] = splitProps(props, ["signal"]);
  let inputRef: HTMLInputElement | undefined;

  // Set indeterminate property via DOM API since it's not an HTML attribute
  createEffect(() => {
    if (inputRef) {
      inputRef.indeterminate = local.signal.get() === "indeterminate";
    }
  });

  return (
    <input
      ref={(el) => (inputRef = el)}
      type="checkbox"
      checked={local.signal.get() === true}
      onChange={(e) => {
        local.signal.set(e.currentTarget.checked);
      }}
      {...others}
    />
  );
}
