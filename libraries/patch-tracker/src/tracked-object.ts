import type { ObjectAssignOperation, Patch, Path } from "@mp/patch";
import { PatchOpCode } from "@mp/patch";
import { emptyPath, isTracker } from "./shared";

export type TrackedObjectConstructor<T extends object> = new (
  initial: T,
) => TrackedObject<T>;

export type TrackedObject<T extends object> = T & Tracker;

export interface Tracker {
  flush(prefix?: Path, outPatch?: Patch): Patch;
}

export function defineTrackedObject<T extends object>(
  trackedProperties: Array<keyof T>,
): TrackedObjectConstructor<T> {
  class SpecificTrackedObject extends TrackedObjectImpl {
    constructor(values: T) {
      super(trackedProperties, values as Record<string, unknown>);
    }
  }

  for (const prop of trackedProperties) {
    Object.defineProperty(SpecificTrackedObject.prototype, prop, {
      enumerable: true,
      configurable: true,
      get() {
        return this.values[prop];
      },
      set(value) {
        this.values[prop] = value;

        // Trackers will flush themselves recursively
        if (!isTracker(value)) {
          this.changes ??= {};
          this.changes[prop] = value;
        }
      },
    });
  }

  return SpecificTrackedObject as unknown as TrackedObjectConstructor<T>;
}

class TrackedObjectImpl implements Tracker {
  protected changes?: ObjectAssignOperation["changes"];
  protected values: Record<string, unknown> = {};

  constructor(
    private trackedProperties: PropertyKey[],
    protected initial: Record<string, unknown>,
  ) {
    // Assign initial values to property setters to trigger tracking behavior
    for (const key in initial) {
      this[key as keyof typeof this] = initial[key] as never;
    }
  }

  flush(path: Path = emptyPath, outPatch: Patch = []): Patch {
    if (this.changes) {
      outPatch.push({
        op: PatchOpCode.ObjectAssign,
        path,
        changes: this.changes,
      });
      this.changes = undefined;
    }
    for (const prop of this.trackedProperties) {
      const value = this.values[prop as keyof typeof this.values];
      if (isTracker(value)) {
        value.flush([...path, String(prop)], outPatch);
      }
    }
    return outPatch;
  }
}
