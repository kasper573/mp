import type { AnyPatch } from "./patch";
import type { SyncMap } from "./sync-map";

export function flushState<P extends AnyPatch>(
  state: AnySyncState,
  patch: P = [] as unknown as P,
): P {
  for (const entityName in state) {
    const value = state[entityName];
    value.flush(entityName, patch);
  }
  return patch;
}

export function updateState(state: AnySyncState, patch: AnyPatch): void {
  for (const op of patch) {
    const map = state[op.entityName];
    map.applyOperation(op);
  }
}

export interface AnySyncState {
  // oxlint-disable-next-line no-explicit-any
  [entityName: PropertyKey]: SyncMap<any, any>;
}
