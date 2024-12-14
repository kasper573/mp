import type { BaseIssue, BaseSchema } from "valibot";
import {
  boolean,
  custom,
  number,
  parse,
  pipe,
  string,
  transform,
  union,
} from "valibot";

export function boolish() {
  return union([boolean(), booleanString()]);
}

export function numeric() {
  return union([number(), numericString()]);
}

export function csv<
  const Schema extends BaseSchema<unknown, unknown, BaseIssue<unknown>>,
>(schema: Schema) {
  return pipe(
    string(),
    transform((value) => value.split(",").map((v) => parse(schema, v.trim()))),
  );
}

export function numericString(): SchemaFor<number> {
  return pipe(
    string(),
    custom((value) => parseNumericString(String(value)) !== undefined),
    transform((value) => parseNumericString(value)!),
  );
}

export function booleanString(): SchemaFor<boolean> {
  return pipe(
    string(),
    custom((value) => {
      const lcs = String(value).toLowerCase();
      return yesValues.has(lcs) || noValues.has(lcs);
    }),
    transform((value) => {
      const lcs = String(value).toLowerCase();
      return yesValues.has(lcs);
    }),
  );
}

function parseNumericString(value: string): number | undefined {
  if (/^\d+$/.test(value)) {
    return Number.parseInt(value, 10);
  }
  if (/^\d+\.\d+$/.test(value)) {
    return Number.parseFloat(value);
  }
}

const yesValues = new Set(["true", "1", "yes", "on"]);

const noValues = new Set(["false", "0", "no", "off"]);

type SchemaFor<T> = BaseSchema<unknown, T, BaseIssue<unknown>>;
