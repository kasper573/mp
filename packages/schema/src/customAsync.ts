import type { BaseIssue, CustomIssue, GenericSchema } from "valibot";
import { pipeAsync, rawTransformAsync, unknown } from "valibot";

export function customAsync<To, From = unknown>(
  fn: (from: From) => Promise<CustomParserResult<To>>,
): GenericSchema<To> {
  return pipeAsync(
    unknown(),
    rawTransformAsync(async (ctx) => {
      const result = await fn(ctx.dataset as From);
      if (result.success) {
        return result.output;
      }

      for (const issue of result.issues) {
        ctx.addIssue(
          typeof issue === "string"
            ? { message: issue }
            : (issue as CustomIssue),
        );
      }
    }),
  ) as unknown as GenericSchema<To>;
}

export type CustomParserResult<T> =
  | { success: true; output: T }
  | { success: false; issues: Array<BaseIssue<unknown> | string> };
