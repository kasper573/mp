import {
  number,
  string as stringSchema,
  boolean as booleanSchema,
  type GenericSchema,
  type InferOutput,
} from "valibot";

export type { InferOutput as TypeOf, GenericSchema as Schema };
export {
  array,
  variant,
  union,
  optional,
  object,
  enum as nativeEnum,
  literal,
  lazy,
  intersect as intersection,
  tuple,
  safeParse as parse,
  safeParseAsync as parseAsync,
  fallback,
  type SafeParseResult,
} from "valibot";

export * from "./literalEnum";
export * from "./customAsync";
export * from "./transform";

export const integer = number();
export const float = number();
export const uchar = number();
export const string = stringSchema();
export const boolean = booleanSchema();
