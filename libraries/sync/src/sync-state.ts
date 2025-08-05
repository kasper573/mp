import { SyncMap } from "./sync-map";
import type { AnyPatch } from "./types";

export function flushState<State, P extends AnyPatch>(
  state: State,
  patch: P = [] as unknown as P,
): P {
  for (const entityName in state) {
    const value = state[entityName];
    if (value instanceof SyncMap) {
      value.flush(entityName, patch);
    }
  }
  return patch;
}

export function updateState<State>(state: State, patch: AnyPatch): void {
  for (const op of patch) {
    const map = state[op.entityName as keyof State];
    if (map instanceof SyncMap) {
      map.applyOperation(op);
    } else {
      throw new Error(`State key "${op.entityName}" is not a SyncMap`);
    }
  }
}
