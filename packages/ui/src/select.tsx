import type { JSX } from "solid-js";
import { For } from "solid-js";

export interface SelectProps<Value extends string>
  extends Pick<JSX.HTMLAttributes<HTMLSelectElement>, "class" | "style"> {
  options: readonly Value[];
  value: NoInfer<Value>;
  onChange: (value: NoInfer<Value>) => void;
}

export function Select<const Value extends string>(props: SelectProps<Value>) {
  return (
    <select
      value={props.value}
      onChange={(e) => props.onChange(e.currentTarget.value as NoInfer<Value>)}
      style={props.style}
      class={props.class}
    >
      <For each={props.options}>
        {(option) => <option value={option}>{String(option)}</option>}
      </For>
    </select>
  );
}
