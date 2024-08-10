import { type GenericSchema, pipe, transform as transformImpl } from "valibot";

export function transform<From, To>(
  base: GenericSchema<From>,
  fn: (from: From) => To,
): GenericSchema<To> {
  return pipe(base, transformImpl(fn)) as GenericSchema<To>;
}
