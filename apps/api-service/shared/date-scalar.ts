import type { ParsingFunctionsObject } from "apollo-link-scalars";

export const GqlDate: ParsingFunctionsObject<Date, unknown> = {
  serialize(value) {
    if (value instanceof Date) {
      return value.toISOString();
    }
    throw new Error(`Cannot serialize non-Date value as Date: ${value}`);
  },
  parseValue(value) {
    switch (typeof value) {
      case "string":
        return new Date(value);
      case "number":
        return new Date(value);
    }
    throw new Error(`Cannot parse Date from value: ${value}`);
  },
};

/** @gqlScalar */
export type GqlDate = Date;
