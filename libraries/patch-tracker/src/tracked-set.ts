import { type Patch, PatchOpCode, type Path } from "@mp/patch";
import { emptyPath, isTracker } from "./shared";
import type { Tracker } from "./tracked-object";

export class TrackedSet<V> extends Set<V> implements Tracker {
  // We simply track dirty state and flush the entire set.
  // It's fine since all our use cases are for small sets.
  // If we require larger sets, we can optimize by changing from dirty tracking to another approach.
  #dirty: boolean;

  constructor(values?: readonly V[]) {
    // Must call super with no arguments since our overrides access private properties
    super();

    this.#dirty = false;
    if (values) {
      for (const v of values) {
        this.add(v);
      }
    }
  }

  override add(value: V): this {
    this.#dirty = true;
    return super.add(value);
  }

  override delete(value: V): boolean {
    this.#dirty = true;
    return super.delete(value);
  }

  override clear(): void {
    if (this.size) {
      this.#dirty = true;
      super.clear();
    }
  }

  flush(path: Path = emptyPath, outPatch: Patch = []): Patch {
    if (this.#dirty) {
      this.#dirty = false;
      outPatch.push({
        op: PatchOpCode.SetReplace,
        path,
        values: Array.from(this), // Copy so future mutations won't affect the patch
      });
    }
    let i = 0;
    for (const v of this) {
      if (isTracker(v)) {
        v.flush([...path, i], outPatch);
      }
      i++;
    }
    return outPatch;
  }
}
