import type { JSX } from "solid-js";
import { createEffect } from "solid-js";
import type { WritableSignal } from "@mp/state";

export type CheckboxState = true | false | "indeterminate";

export interface CheckboxProps extends Pick<
  JSX.IntrinsicElements["input"],
  "class" | "style" | "disabled"
> {
  // Accept any signal that can read CheckboxState-compatible values and write booleans
  signal: WritableSignal<boolean> | WritableSignal<CheckboxState>;
}

export function Checkbox(props: CheckboxProps) {
  let inputRef!: HTMLInputElement;

  createEffect(() => {
    inputRef.indeterminate = props.signal.get() === "indeterminate";
  });

  return (
    <input
      ref={(el) => (inputRef = el)}
      type="checkbox"
      checked={props.signal.get() === true}
      onChange={(e) => {
        // Signal.write is invariant, but we know checkbox always produces boolean
        (props.signal as WritableSignal<boolean>).write(
          e.currentTarget.checked,
        );
      }}
      class={props.class}
      style={props.style}
      disabled={props.disabled}
    />
  );
}
