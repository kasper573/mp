import type { Type } from "arktype";
import { type } from "arktype";

const yesValues = new Set(["true", "1", "yes", "on"]);
const noValues = new Set(["false", "0", "no", "off"]);

/**
 * Accepts true/false *or* any of
 * "true","false","1","0","yes","no","on","off" (case-insensitive).
 */
export function booleanString() {
  return type("string").pipe((value) => {
    const lcs = value.toLowerCase();
    if (yesValues.has(lcs)) return true;
    if (noValues.has(lcs)) return false;
    throw new Error(`Invalid boolean string: "${value}"`);
  });
}

/**
 * boolean | booleanString
 */
export function boolish() {
  return type("boolean").or(booleanString());
}

/**
 * number | string.numeric.parse
 */
export function numericString() {
  return type("string.numeric.parse");
}

export function numeric() {
  return type("number").or(numericString());
}

/**
 * Turn a comma-separated string into an array
 * of your schema’s outputs.
 */
export function csv<O>(schema: Type<unknown, O>): Type<string, O[]> {
  return type("string").pipe((value) =>
    value.split(",").map((v) => schema.assert(v.trim())),
  ) as never;
}
