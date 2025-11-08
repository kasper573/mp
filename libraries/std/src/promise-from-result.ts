import type { ResultAsync } from "neverthrow";

/**
 * Helps integrate neverthrow with promise based systems
 */
export async function promiseFromResult<Output, Error>(
  result: ResultAsync<Output, Error>,
): Promise<Output> {
  const value = await result.match(
    (output) => Promise.resolve(output),
    (error) => Promise.reject(error),
  );
  return value;
}
