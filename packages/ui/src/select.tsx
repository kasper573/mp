import type { JSX } from "solid-js";
import { createMemo, Index } from "solid-js";

export interface SelectOption<Value> {
  label: JSX.Element;
  value: Value;
}

type SelectOptionsInput<Value> =
  | readonly SelectOption<Value>[]
  | readonly Value[];

export type SelectProps<Value> =
  | OptionalSelectProps<Value>
  | RequiredSelectProps<Value>;

interface BaseSelectProps<Value, InputValue, OutputValue>
  extends Pick<JSX.HTMLAttributes<HTMLSelectElement>, "class" | "style"> {
  options: SelectOptionsInput<Value>;
  value: InputValue;
  onChange: (value: OutputValue) => void;
  isSameValue?: (a: NoInfer<Value>, b: NoInfer<Value>) => boolean;
}

export interface OptionalSelectProps<Value>
  extends BaseSelectProps<
    Value,
    NoInfer<Value> | undefined,
    NoInfer<Value> | undefined
  > {
  required?: false;
}

export interface RequiredSelectProps<Value>
  extends BaseSelectProps<Value, NoInfer<Value>, NoInfer<Value>> {
  required: true;
}

export function Select<const Value>(props: SelectProps<Value>) {
  const options = createMemo(() => normalizeOptionsInput(props.options));
  const isSameValue = (a: Value, b: Value) =>
    props.isSameValue?.(a, b) ?? a === b;
  const selectedIndex = createMemo(() =>
    options().findIndex((option) =>
      isSameValue(option.value, props.value as Value),
    ),
  );

  return (
    <select
      value={selectedIndex()}
      onInput={(e) => {
        const optionIndex = Number.parseInt(e.currentTarget.value, 10);
        props.onChange(options()[optionIndex].value);
      }}
      style={props.style}
      class={props.class}
    >
      <Index each={options()}>
        {(option, index) => <option value={index}>{option().label}</option>}
      </Index>
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
