// Since drizzle is promise-based, but we want to work with results to ensure
// errors are never unhandled and crash in production, so we need to wrap
// all procedure definitions in a convention. We use a builder pattern.

import { ResultAsync } from "@mp/std";
import type { DrizzleClient } from "./client";

export function procedure(): DrizzleProcedureBuilder<void, never> {
  return new DrizzleProcedureBuilder(() => {
    throw new Error("Procedure query function not defined");
  });
}

class DrizzleProcedureBuilder<Input, Output> {
  constructor(
    private queryFn: (drizzle: DrizzleClient, input: Input) => Promise<Output>,
  ) {}

  input<NewInput>() {
    return new DrizzleProcedureBuilder<NewInput, Output>(() => {
      throw new Error("Procedure query function not defined");
    });
  }

  query<NewOutput>(
    query: (client: DrizzleClient, input: Input) => Promise<NewOutput>,
  ) {
    return new DrizzleProcedureBuilder<Input, NewOutput>(query);
  }

  build(client: DrizzleClient): DbProcedure<Input, Output> {
    return (input) =>
      ResultAsync.fromPromise(this.queryFn(client, input), (error) =>
        error instanceof Error
          ? error
          : new Error("Unknown database error", { cause: error }),
      );
  }
}

export type DbProcedure<Input, Output> = (
  input: Input,
) => ResultAsync<Output, Error>;
