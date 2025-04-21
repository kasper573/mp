import type { Patch, Operation } from "./patch";

export function dedupePatch(patch: Patch): Patch {
  const current = new Map<string, Operation>();
  const finalPatch = new Set<Operation>(patch);

  for (let i = patch.length - 1; i >= 0; i--) {
    const op = patch[i];
    const key = op[0].join(".");
    if (current.has(key)) {
      finalPatch.delete(op);
    }
    current.set(key, op);
  }

  return Array.from(finalPatch);
}
