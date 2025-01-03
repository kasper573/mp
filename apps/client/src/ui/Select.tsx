import type { JSX } from "solid-js";
import { For, createMemo, splitProps } from "solid-js";

export interface SelectProps<Value>
  extends Omit<JSX.HTMLAttributes<HTMLSelectElement>, "onChange"> {
  options: readonly Value[];
  value: NoInfer<Value>;
  onChange: (value: NoInfer<Value>) => void;
}

export function Select<const Value>(props: SelectProps<Value>) {
  const [selectProps, htmlProps] = splitProps(props, [
    "options",
    "value",
    "onChange",
  ]);

  const selectedIndex = createMemo(() =>
    selectProps.options.indexOf(props.value),
  );

  return (
    <select
      value={selectedIndex()}
      onChange={(e) =>
        selectProps.onChange(selectProps.options[e.currentTarget.selectedIndex])
      }
      {...htmlProps}
    >
      <For each={props.options}>
        {(option, index) => <option value={index()}>{String(option)}</option>}
      </For>
    </select>
  );
}
