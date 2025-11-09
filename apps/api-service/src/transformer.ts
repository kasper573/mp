import type { SuperJSONResult } from "superjson";
import { SuperJSON } from "superjson";

/**
 * Recursively checks for class instances in the data structure.
 * Class instances are objects whose constructor is not one of the built-in types.
 * Throws an error if any class instance is found.
 */
function assertNoUnsupportedTypes(value: unknown, path = "root"): void {
  if (value === null || value === undefined) {
    return;
  }

  // Handle arrays
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      assertNoUnsupportedTypes(item, `${path}[${index}]`),
    );
    return;
  }

  // Only check objects (not primitives)
  if (typeof value !== "object") {
    return;
  }

  const constructor = value.constructor;
  const constructorName = constructor?.name;

  // Skip built-in types that SuperJSON handles natively
  const builtInTypes = [
    "Object",
    "Array",
    "Date",
    "RegExp",
    "Error",
    "Map",
    "Set",
    "BigInt",
    "URL",
  ];

  if (constructorName && !builtInTypes.includes(constructorName)) {
    // This is a class instance - throw an error
    throw new Error(
      `Detected class instance "${constructorName}" at path "${path}". ` +
        `Class instances cannot be reliably serialized through tRPC. ` +
        `Consider using plain objects or registering the class with SuperJSON. ` +
        `See: https://github.com/blitz-js/superjson#class-support`,
    );
  }

  // Recursively check object properties
  for (const [key, val] of Object.entries(value)) {
    assertNoUnsupportedTypes(val, `${path}.${key}`);
  }
}

/**
 * Creates a transformer that wraps SuperJSON and asserts no unsupported data types.
 * Specifically, it detects class instances that haven't been registered with SuperJSON,
 * as these cannot be properly serialized and may cause issues.
 */
function createAssertingTransformer() {
  return {
    serialize(object: unknown): SuperJSONResult {
      assertNoUnsupportedTypes(object);
      return SuperJSON.serialize(object);
    },
    deserialize<T = unknown>(payload: SuperJSONResult): T {
      return SuperJSON.deserialize<T>(payload);
    },
  };
}

export const transformer = createAssertingTransformer();
