import type { Class } from "./types";

export const DEPS = Symbol("rift.module.deps");

export interface DepEntry {
  readonly cls: Class;
  readonly set: (instance: object, value: object) => void;
}

export interface DepsMetadata {
  [DEPS]?: Map<PropertyKey, DepEntry>;
}

export function getDeps(
  mod: object,
): ReadonlyMap<PropertyKey, DepEntry> | undefined {
  // Walk the prototype chain so subclasses inherit injection metadata declared
  // on their ancestors. Some transpilers don't propagate the TC39 stage 3
  // parentClass argument when emitting decorator helpers, so the metadata on
  // the constructor itself only carries directly-declared accessors.
  let merged: Map<PropertyKey, DepEntry> | undefined;
  let ctor: object | null = mod.constructor;
  while (ctor && ctor !== Object.prototype) {
    const meta = (ctor as { [k: symbol]: unknown })[Symbol.metadata] as
      | DepsMetadata
      | undefined;
    const localDeps = meta?.[DEPS];
    if (localDeps && localDeps.size > 0) {
      if (!merged) {
        merged = new Map();
      }
      for (const [name, entry] of localDeps) {
        if (!merged.has(name)) {
          merged.set(name, entry);
        }
      }
    }
    ctor = Object.getPrototypeOf(ctor) as object | null;
  }
  return merged;
}
