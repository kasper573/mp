import { literal, union } from "valibot";

export function literalEnum<Values extends unknown[]>(...values: Values) {
  return union(values.map(literal));
}
