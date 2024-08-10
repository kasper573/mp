import {
  number,
  unknown as unknownSchema,
  string as stringSchema,
  boolean as booleanSchema,
  never as neverSchema,
  type GenericSchema,
  type InferOutput,
  pipe,
  transform as transformImpl,
} from "valibot";

export type { InferOutput as TypeOf, GenericSchema as Type };
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
  parse,
  parseAsync,
  safeParse,
  safeParseAsync,
  fallback,
} from "valibot";

export * from "./literalEnum";
export * from "./customAsync";

export const unknown = unknownSchema();
export const integer = number();
export const float = number();
export const uchar = number();
export const string = stringSchema();
export const boolean = booleanSchema();
export const never = neverSchema();

export function transform<From, To>(
  base: GenericSchema<From>,
  fn: (from: From) => To,
): GenericSchema<To> {
  return pipe(base, transformImpl(fn)) as GenericSchema<To>;
}
