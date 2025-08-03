import {
  type Patch,
  PatchOpCode,
  type Path,
  type PathSegment,
} from "@mp/patch";
import { emptyPath, isTracker } from "./shared";
import type { Tracker } from "./tracked-object";

export class TrackedMap<K extends PathSegment, V>
  extends Map<K, V>
  implements Tracker
{
  #setKeys: Set<K>;
  #deleteKeys: Set<K>;

  constructor(entries?: readonly (readonly [K, V])[] | null) {
    // Must call super with no arguments since our overrides access private properties
    super();

    this.#setKeys = new Set();
    this.#deleteKeys = new Set();
    if (entries) {
      for (const [k, v] of entries) {
        this.set(k, v);
      }
    }
  }

  override set(key: K, value: V): this {
    this.#setKeys.add(key);
    this.#deleteKeys.delete(key);
    super.set(key, value);
    return this;
  }

  override delete(key: K): boolean {
    if (super.delete(key)) {
      this.#deleteKeys.add(key);
      this.#setKeys.delete(key);
      return true;
    }
    return false;
  }

  override clear() {
    this.#setKeys.clear();
    this.#deleteKeys = new Set(this.keys());
    return super.clear();
  }

  flush(path: Path = emptyPath, patch: Patch = []): Patch {
    // Stale keys may still contain patches if they are trackers, so we need to flush those as well.
    const staleKeys = new Set(this.keys()).difference(this.#setKeys);
    for (const key of staleKeys) {
      const v = this.get(key);
      if (isTracker(v)) {
        v.flush([...path, key], patch);
      }
    }

    for (const key of this.#setKeys) {
      patch.push({
        op: PatchOpCode.MapSet,
        path,
        key,
        value: this.get(key),
      });
    }

    for (const key of this.#deleteKeys) {
      patch.push({
        op: PatchOpCode.MapDelete,
        path,
        key,
      });
    }

    this.#setKeys.clear();
    this.#deleteKeys.clear();

    return patch;
  }
}
