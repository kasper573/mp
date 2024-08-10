import type { GenericSchema } from "valibot";
import { pipeAsync, rawTransformAsync, unknown } from "valibot";

export function customAsync<From, To>(
  fn: (from: From) => Promise<To>,
): GenericSchema<To> {
  return pipeAsync(
    unknown(),
    rawTransformAsync(async (ctx) => {
      try {
        return await fn(ctx.dataset as From);
      } catch (error) {
        ctx.addIssue({ message: String(error) });
      }
    }),
  ) as unknown as GenericSchema<To>;
}

rawTransformAsync((ctx) => {
  ctx.dataset;
});
