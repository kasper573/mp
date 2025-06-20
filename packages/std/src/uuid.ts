import { v5 } from "uuid";

export { v7 as createUuid } from "uuid";

export function createSeededUuid(seed: string, namespace: string): string {
  return v5(seed, namespace);
}
