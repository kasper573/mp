import type { Result } from "@mp/std";
import { ResultAsync, err, ok } from "@mp/std";
import { DbClient, type DrizzleClient } from "./client";

/**
 * Wraps a database operation in a Result type for safe error handling.
 * This ensures that database errors are handled explicitly and type-safely.
 *
 * @example
 * ```ts
 * const result = await safeDbOperation(db, async (drizzle) => {
 *   return await drizzle.select().from(table).where(eq(table.id, id));
 * });
 *
 * if (result.isOk()) {
 *   console.log(result.value);
 * } else {
 *   console.error(result.error);
 * }
 * ```
 */
export function safeDbOperation<T>(
  db: DbClient,
  operation: (drizzle: DrizzleClient) => Promise<T>,
): ResultAsync<T, Error> {
  return ResultAsync.fromPromise(operation(DbClient.unwrap(db)), (error) => {
    if (error instanceof Error) {
      return error;
    }
    return new Error(String(error));
  });
}

/**
 * Synchronous version of safeDbOperation for operations that don't involve async work.
 * Use this when you need to wrap synchronous database preparation logic.
 */
export function safeDbOperationSync<T>(
  db: DbClient,
  operation: (drizzle: DrizzleClient) => T,
): Result<T, Error> {
  try {
    return ok(operation(DbClient.unwrap(db)));
  } catch (error) {
    if (error instanceof Error) {
      return err(error);
    }
    return err(new Error(String(error)));
  }
}

/**
 * Type guard to check if a value is a Result type.
 * Use this in ESLint rules to enforce Result return types for database operations.
 */
export type DbResult<T> = Result<T, Error> | ResultAsync<T, Error>;

/**
 * Helper to convert a throwing database operation into a safe one.
 * This is useful for gradually migrating existing code.
 */
export async function toSafeDbOperation<T>(
  operation: () => Promise<T>,
): Promise<Result<T, Error>> {
  try {
    return ok(await operation());
  } catch (error) {
    if (error instanceof Error) {
      return err(error);
    }
    return err(new Error(String(error)));
  }
}
