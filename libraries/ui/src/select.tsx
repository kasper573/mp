import type { Signal } from "@mp/state";
import { createMemo, type JSX, type JSXElement, Index, type Accessor } from "solid-js";

export interface SelectOption<Value> {
  label: JSXElement;
  value: Value;
}

type SelectOptionsInput<Value> =
  | readonly SelectOption<Value>[]
  | readonly Value[];

interface SelectProps<Value> extends Pick<
  JSX.IntrinsicElements["select"],
  "class" | "style"
> {
  options: SelectOptionsInput<Value>;
  signal: Signal<Value>;
  isSameValue?: (a: Value, b: Value) => boolean;
}

export function Select<const Value>({
  options: inputOptions,
  signal,
  isSameValue = refEquals,
  ...selectProps
}: SelectProps<Value>) {
  const options = createMemo(() => normalizeOptionsInput(inputOptions));

  const selectedIndex = () =>
    options().findIndex((option: SelectOption<Value>) =>
      isSameValue(option.value, signal.get()),
    );

  return (
    <select
      value={selectedIndex()}
      onInput={(e) => {
        const optionIndex = Number.parseInt(e.currentTarget.value, 10);
        signal.set(options()[optionIndex].value);
      }}
      {...selectProps}
    >
      <Index each={options()}>
        {(option: Accessor<SelectOption<Value>>, index: number) => (
          <option value={index}>{option().label}</option>
        )}
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

function refEquals<T>(a: T, b: T): boolean {
  return a === b;
}
