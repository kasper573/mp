import type { GenericSchemaAsync } from "valibot";
import { pipeAsync, transformAsync, unknown } from "valibot";

export function customAsync<From, To>(
  fn: (from: From) => Promise<To>,
): GenericSchemaAsync<To> {
  return pipeAsync(unknown(), transformAsync(fn)) as GenericSchemaAsync<To>;
}
