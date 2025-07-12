export interface RangeProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (newValue: number) => void;
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
        value={props.value}
        onInput={(e) => props.onChange(+e.currentTarget.value)}
      />
      {props.value}
    </div>
  );
}
