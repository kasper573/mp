import type { PatchPathStep } from "./patch";
import type { Patch } from "./patch";
import { flushSyncComponent, isSyncComponent } from "./sync-component";

/**
 * Base class for entities that has one of more SyncComponent members
 */
export abstract class SyncEntity {
  /**
   * Produces a patch that represents all changes since the last flush.
   */
  flush(path: PatchPathStep[] = [], patch: Patch = []): Patch {
    for (const key in this) {
      flushSyncComponent(this[key], [...path, key], patch);
    }
    return patch;
  }

  selectComponentData(): Partial<this> {
    const data: Partial<this> = {};
    for (const key in this) {
      if (isSyncComponent(this[key])) {
        data[key] = this[key];
      }
    }
    return data;
  }
}
