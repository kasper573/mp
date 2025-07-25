import type { Signal } from "@mp/state";

export interface RangeProps {
  label: string;
  min: number;
  max: number;
  step: number;
  signal: Signal<number>;
}

export function Range(props: RangeProps) {
  return (
    <div style={{ display: "flex" }}>
      <label>{props.label}</label>
      <input
        type="range"
        min={props.min}
        max={props.max}
        step={props.step}
        value={props.signal.value}
        onInput={(e) => {
          props.signal.value = e.currentTarget.valueAsNumber;
        }}
      />
      {props.signal.value}
    </div>
  );
}
