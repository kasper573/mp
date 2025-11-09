import type { SuperJSONResult } from "superjson";
import { SuperJSON } from "superjson";

/**
 * Creates a transformer that wraps SuperJSON and warns about unsupported data types.
 * Specifically, it detects class instances that haven't been registered with SuperJSON,
 * as these cannot be properly serialized and may cause issues.
 */
function createWarningTransformer() {
  const warnedTypes = new Set<string>();

  /**
   * Recursively checks for class instances in the data structure.
   * Class instances are objects whose constructor is not one of the built-in types.
   */
  function detectUnsupportedTypes(value: unknown, path = "root"): void {
    if (value === null || value === undefined) {
      return;
    }

    // Handle arrays
    if (Array.isArray(value)) {
      value.forEach((item, index) =>
        detectUnsupportedTypes(item, `${path}[${index}]`),
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
      // This is a class instance - warn about it
      const warningKey = `${constructorName}:${path}`;
      if (!warnedTypes.has(warningKey)) {
        warnedTypes.add(warningKey);
        // oxlint-disable-next-line no-console
        console.warn(
          `[API Transformer Warning] Detected class instance "${constructorName}" at path "${path}". ` +
            `Class instances cannot be reliably serialized through tRPC. ` +
            `Consider using plain objects or registering the class with SuperJSON. ` +
            `See: https://github.com/blitz-js/superjson#class-support`,
        );
      }
    }

    // Recursively check object properties
    for (const [key, val] of Object.entries(value)) {
      detectUnsupportedTypes(val, `${path}.${key}`);
    }
  }

  return {
    serialize(object: unknown): SuperJSONResult {
      // Check environment dynamically (not at creation time)
      if (process.env.NODE_ENV !== "production") {
        detectUnsupportedTypes(object);
      }
      return SuperJSON.serialize(object);
    },
    deserialize<T = unknown>(payload: SuperJSONResult): T {
      const result = SuperJSON.deserialize<T>(payload);
      // Check environment dynamically (not at creation time)
      if (process.env.NODE_ENV !== "production") {
        detectUnsupportedTypes(result);
      }
      return result;
    },
  };
}

export const transformer = createWarningTransformer();
