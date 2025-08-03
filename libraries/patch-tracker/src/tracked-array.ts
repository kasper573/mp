import { type Patch, PatchOpCode, type Path } from "@mp/patch";
import { emptyPath, isTracker } from "./shared";
import type { Tracker } from "./tracked-object";

export class TrackedArray<V> extends Array<V> implements Tracker {
  // We simply track dirty state and flush the entire array.
  // It's fine since all our use cases are for small arrays.
  // If we require larger ararys, we can optimize by changing from dirty tracking to another approach.
  #dirty = false;

  override push(...items: V[]): number {
    this.#dirty = true;
    return super.push(...items);
  }

  override pop(): V | undefined {
    this.#dirty = true;
    return super.pop();
  }

  override shift(): V | undefined {
    this.#dirty = true;
    return super.shift();
  }

  override unshift(...items: V[]): number {
    this.#dirty = true;
    return super.unshift(...items);
  }

  override splice(start: number, deleteCount?: number, ...items: V[]): V[] {
    this.#dirty = true;
    return super.splice(start, deleteCount as number, ...items);
  }

  flush(path: Path = emptyPath, outPatch: Patch = []): Patch {
    if (this.#dirty) {
      this.#dirty = false;
      outPatch.push({
        op: PatchOpCode.ArrayReplace,
        path,
        elements: this.slice(), // Copy so future mutations won't affect the patch
      });
    }
    for (let i = 0; i < this.length; i++) {
      const v = this[i];
      if (isTracker(v)) {
        v.flush([...path, i], outPatch);
      }
    }
    return outPatch;
  }
}
