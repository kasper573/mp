import type { Patch } from "./patch";
import { PatchType } from "./patch";

export function dedupePatch(patch: Patch): Patch {
  const seen = new Set<string>();
  const deduped: Patch = [];

  for (let i = patch.length - 1; i >= 0; i--) {
    const op = patch[i];
    const key = op[1].join(".");

    if (op[0] === PatchType.Set || op[0] === PatchType.Remove) {
      if (!seen.has(key)) {
        seen.add(key);
        deduped.push(op);
      }
    } else if (!seen.has(key)) {
      deduped.push(op);
    }
  }

  return deduped.reverse();
}
