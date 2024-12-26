export const errorTransformer = {
  isApplicable,
  serialize,
  deserialize,
};

function isApplicable(value: unknown): value is Error {
  return value instanceof Error;
}

function serialize(error: Error) {
  return {
    message: error.message,
    stack: error.stack,
    name: error.name,
  };
}

function deserialize(value: Record<string, unknown>): Error {
  const error = new Error(value.message as string);
  error.stack = String(value.stack);
  error.name = String(value.name);
  return error;
}
