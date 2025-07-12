import type { JSX, ComponentChildren } from "preact";
import { useMemo } from "preact/hooks";

export interface SelectOption<Value> {
  label: ComponentChildren;
  value: Value;
}

type SelectOptionsInput<Value> =
  | readonly SelectOption<Value>[]
  | readonly Value[];

export type SelectProps<Value> =
  | OptionalSelectProps<Value>
  | RequiredSelectProps<Value>;

interface BaseSelectProps<Value, InputValue, OutputValue>
  extends Pick<JSX.IntrinsicElements["select"], "className" | "style"> {
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

export function Select<const Value>({
  options: inputOptions,
  value,
  isSameValue = refEquals,
  onChange,
  ...selectProps
}: SelectProps<Value>) {
  const options = useMemo(
    () => normalizeOptionsInput(inputOptions),
    [inputOptions],
  );

  const selectedIndex = useMemo(
    () =>
      options.findIndex((option) => isSameValue(option.value, value as Value)),
    [options, value],
  );

  return (
    <select
      value={selectedIndex}
      onInput={(e) => {
        const optionIndex = Number.parseInt(e.currentTarget.value, 10);
        onChange(options[optionIndex].value);
      }}
      {...selectProps}
    >
      {options.map((option, index) => (
        <option key={index} value={index}>
          {option.label}
        </option>
      ))}
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

function refEquals<T>(a: T, b: T): boolean {
  return a === b;
}
