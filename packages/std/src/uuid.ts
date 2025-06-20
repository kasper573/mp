import { v5 } from "uuid";

export { v7 as createUuid } from "uuid";

/**
 * Creates a UUID-like string based on a given seed.
 */
export function createSeededUuidLike(seed: string, namespace: string): string {
  return v5(seed, namespace);
}
