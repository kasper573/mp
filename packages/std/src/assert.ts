export function assert<Value>(value: Value | null | undefined): Value {
  if (value === null || value === undefined) {
    throw new Error("Value is null or undefined");
  }
  return value;
}
