export function assert<Value>(
  value: Value | null | undefined,
  errorMessage = "Value is null or undefined",
): Value {
  if (value === null || value === undefined) {
    throw new Error(errorMessage);
  }
  return value;
}
