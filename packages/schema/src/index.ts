import {
  number,
  string as stringSchema,
  boolean as booleanSchema,
  type GenericSchemaAsync,
  type InferOutput,
} from "valibot";

export type { InferOutput as TypeOf, GenericSchemaAsync as Schema };
export {
  arrayAsync as array,
  variantAsync as variant,
  unionAsync as union,
  optionalAsync as optional,
  objectAsync as object,
  enum as nativeEnum,
  literal,
  lazyAsync as lazy,
  pipeAsync as pipe,
  transformAsync as transform,
  intersectAsync as intersection,
  tupleAsync as tuple,
  parseAsync as parse,
  fallbackAsync as fallback,
  picklist,
  flatten,
  ValiError as ParseError,
  type SafeParseResult,
} from "valibot";

export const integer = number();
export const float = number();
export const uchar = number();
export const string = stringSchema();
export const boolean = booleanSchema();
