import type { Signal } from "@mp/state";
import type { JSX } from "solid-js";
import { createMemo, splitProps, For } from "solid-js";

export interface SelectOption<Value> {
  label: JSX.Element;
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

export function Select<const Value>(props: SelectProps<Value>) {
  const [local, selectProps] = splitProps(props, [
    "options",
    "signal",
    "isSameValue",
  ]);
  const isSameValue = local.isSameValue ?? refEquals;

  const options = createMemo(() => normalizeOptionsInput(local.options));

  const selectedIndex = () =>
    options().findIndex((option) =>
      isSameValue(option.value, local.signal.get()),
    );

  return (
    <select
      value={selectedIndex()}
      onInput={(e) => {
        const optionIndex = Number.parseInt(e.currentTarget.value, 10);
        local.signal.set(options()[optionIndex].value);
      }}
      {...selectProps}
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

function refEquals<T>(a: T, b: T): boolean {
  return a === b;
}
