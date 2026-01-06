// Since drizzle is promise-based, but we want to work with results to ensure
// errors are never unhandled and crash in production, so we need to wrap
// all procedure definitions in a convention. We use a builder pattern.

import type { Result } from "@mp/std";
import { err, Err, ok, Ok, ResultAsync } from "@mp/std";
import { DrizzleError } from "drizzle-orm";
import type { DrizzleClient } from "./client";

export function procedure(): DrizzleProcedureBuilder<void, never, never> {
  return new DrizzleProcedureBuilder(() => {
    throw new Error("Procedure query function not defined");
  });
}

class DrizzleProcedureBuilder<Input, Output, CustomError extends BaseError> {
  constructor(
    private queryFn: DbProcedureQueryFn<Input, Output, CustomError>,
  ) {}

  input<NewInput>() {
    return new DrizzleProcedureBuilder<NewInput, Output, CustomError>(() => {
      throw new Error("Procedure query function not defined");
    });
  }

  error<NewCustomError extends BaseError>() {
    return new DrizzleProcedureBuilder<Input, Output, NewCustomError>(() => {
      throw new Error("Procedure query function not defined");
    });
  }

  query<NewOutput>(queryFn: DbProcedureQueryFn<Input, NewOutput, CustomError>) {
    return new DrizzleProcedureBuilder<Input, NewOutput, CustomError>(queryFn);
  }

  build(client: DrizzleClient): DbProcedure<Input, Output, CustomError> {
    return (input) =>
      new ResultAsync(
        (async () => {
          try {
            const result = await this.queryFn(client, input);
            if (result instanceof Err || result instanceof Ok) {
              return result;
            }

            return ok(result);
          } catch (error) {
            if (error instanceof DrizzleError) {
              return err({ type: "drizzle", error });
            }
            return err({ type: "unknown", error });
          }
        })(),
      );
  }
}

export type DbProcedureQueryFn<Input, Output, CustomError> = (
  client: DrizzleClient,
  input: Input,
) =>
  | Promise<Result<Output, CustomError> | Output>
  | Result<Output, CustomError>
  | Output;

export type DbProcedure<Input, Output, CustomError extends BaseError> = (
  input: Input,
) => ResultAsync<Output, CustomError | BuiltinErrors>;

interface BaseError<Type extends string = string> {
  type: Type;
}

type BuiltinErrors =
  | { type: "drizzle"; error: DrizzleError }
  | { type: "unknown"; error: unknown };
