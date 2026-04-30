import type { Class } from "./types";

export const DEPS = Symbol("rift.module.deps");

export interface DepEntry {
  readonly cls: Class;
  readonly set: (instance: object, value: object) => void;
}

export interface DepsMetadata {
  [DEPS]?: Map<PropertyKey, DepEntry>;
}

export function getDeps(mod: object) {
  return mod.constructor[Symbol.metadata]?.[DEPS] as
    | ReadonlyMap<PropertyKey, DepEntry>
    | undefined;
}
