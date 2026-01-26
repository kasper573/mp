import type { JSX } from "solid-js";
import { createEffect } from "solid-js";
import type { Signal } from "@mp/state";

export type CheckboxState = true | false | "indeterminate";

export interface CheckboxProps<T extends CheckboxState = CheckboxState>
  extends Pick<
    JSX.IntrinsicElements["input"],
    "class" | "style" | "disabled" | "children"
  > {
  signal: Signal<T>;
}

export function Checkbox<T extends CheckboxState = CheckboxState>({
  signal,
  ...props
}: CheckboxProps<T>) {
  let inputRef: HTMLInputElement | undefined;

  createEffect(() => {
    if (inputRef) {
      inputRef.indeterminate = signal.get() === "indeterminate";
    }
  });

  return (
    <input
      ref={(el) => (inputRef = el)}
      type="checkbox"
      checked={signal.get() === true}
      onChange={(e) => {
        signal.set(e.currentTarget.checked as T);
      }}
      {...props}
    />
  );
}
