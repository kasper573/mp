export function composeError(args: unknown[]): Error {
  const realErrors: Error[] = [];
  const excessArgs: unknown[] = [];
  for (const arg of args) {
    if (arg instanceof Error) {
      realErrors.push(arg);
    } else {
      excessArgs.push(arg);
    }
  }
  if (realErrors.length > 1) {
    return enhanceErrorMessage(mergeErrors(realErrors), excessArgs);
  }
  if (realErrors.length === 1) {
    return enhanceErrorMessage(realErrors[0], excessArgs);
  }
  return new Error(createErrorMessage(excessArgs));
}

function mergeErrors(errors: Error[]): Error {
  const messages = errors
    .map((e, n) => `Error #${n + 1}: ${e.message}`)
    .join("\n");
  const stacks = errors.map((e, n) => `Stack #${n + 1}: ${e.stack}`).join("\n");
  const result = new Error(messages);
  result.stack = stacks;
  return result;
}

function enhanceErrorMessage(error: Error, args: unknown[]): Error {
  error.message = createErrorMessage([error.message, ...args]);
  return error;
}

function createErrorMessage(args: unknown[]): string {
  return args.map(stringify).join(", ");
}

function stringify(arg: unknown): string {
  if ((arg !== null && typeof arg === "object") || Array.isArray(arg)) {
    return JSON.stringify(arg);
  }
  return String(arg);
}
