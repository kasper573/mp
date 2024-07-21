export interface Temporal<Value> {
  value: Value;
  interpolation?: Interpolation<Value>;
}

export function temporal<Value>(value: Value): Temporal<Value> {
  return { value };
}

export function setTemporalTarget<Value>(
  temporal: Temporal<Value>,
  newTargetValue: Value,
): void {
  temporal.interpolation = {
    startValue: temporal.value,
    targetValue: newTargetValue,
  };
}

export function updateTemporal<Value>(
  temporal: Temporal<Value>,
  now: Date,
  impl: TemporalImpl<Value>,
): Value {
  if (temporal.interpolation) {
    temporal.interpolation.startTime ??= now;
    const { startTime, startValue, targetValue } = temporal.interpolation;
    const deltaTime = (now.getTime() - startTime.getTime()) / 1000;
    temporal.value = impl.update(startValue, targetValue, deltaTime);
    if (impl.equals(temporal.value, targetValue)) {
      temporal.interpolation = undefined;
    }
  }
  return temporal.value;
}

export interface Interpolation<Value> {
  startTime?: Date;
  startValue: Value;
  targetValue: Value;
}

export interface TemporalImpl<Value> {
  update: (from: Value, to: Value, deltaTime: number) => Value;
  equals: (a: Value, b: Value) => boolean;
}
