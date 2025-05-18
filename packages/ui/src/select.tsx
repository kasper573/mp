import type { JSX } from "solid-js";
import { createMemo, For } from "solid-js";

export interface SelectOption<Value> {
  label: JSX.Element;
  value: Value;
}

type SelectOptionsInput<Value> =
  | readonly SelectOption<Value>[]
  | readonly Value[];

export interface SelectProps<Value>
  extends Pick<JSX.HTMLAttributes<HTMLSelectElement>, "class" | "style"> {
  options: SelectOptionsInput<Value>;
  value: NoInfer<Value>;
  onChange: (value: NoInfer<Value>) => void;
  isSameValue?: (a: NoInfer<Value>, b: NoInfer<Value>) => boolean;
}

export function Select<const Value>(props: SelectProps<Value>) {
  const options = createMemo(() => normalizeOptionsInput(props.options));
  const isSameValue = (a: Value, b: Value) =>
    props.isSameValue?.(a, b) ?? a === b;
  const selectedIndex = createMemo(() =>
    options().findIndex((option) => isSameValue(option.value, props.value)),
  );
  return (
    <select
      value={selectedIndex()}
      onChange={(e) => {
        const optionIndex = Number.parseInt(e.currentTarget.value, 10);
        props.onChange(options()[optionIndex].value);
      }}
      style={props.style}
      class={props.class}
    >
      <For each={options()}>
        {(option, index) => <option value={index()}>{option.label}</option>}
      </For>
    </select>
  );
}

function normalizeOptionsInput<Value>(
  input: SelectOptionsInput<Value>,
): SelectOption<Value>[] {
  return input.map((option) =>
    isSelectOption(option) ? option : { label: String(option), value: option },
  );
}

function isSelectOption<Value>(option: unknown): option is SelectOption<Value> {
  if (typeof option !== "object") {
    return false;
  }
  if (option === null) {
    return false;
  }
  return "label" in option && "value" in option;
}
