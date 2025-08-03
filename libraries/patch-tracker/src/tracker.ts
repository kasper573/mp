import type {
  ObjectAssignOperation,
  Patch,
  Path,
  PathSegment,
} from "@mp/patch";
import { PatchOpCode } from "@mp/patch";

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
    constructor(initial: T) {
      super(trackedProperties as Path, initial as Record<string, unknown>);
    }
  }

  return SpecificTrackedObject as unknown as TrackedObjectConstructor<T>;
}

class TrackedObjectImpl implements Tracker {
  #changes?: ObjectAssignOperation["changes"];

  constructor(trackedPropertyNames: Path, object: Record<string, unknown>) {
    for (const prop of trackedPropertyNames) {
      Object.defineProperty(this, prop, {
        enumerable: true,
        configurable: true,
        get: () => object[prop],
        set: (value) => {
          this.#changes ??= {};
          this.#changes[prop] = value;
          object[prop] = value;
        },
      });
    }
  }

  flush(path: Path = emptyPath, outPatch: Patch = []): Patch {
    if (this.#changes) {
      outPatch.push({
        op: PatchOpCode.ObjectAssign,
        path,
        changes: this.#changes,
      });
      this.#changes = undefined;
    }
    return outPatch;
  }
}

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
    return outPatch;
  }
}

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
        super.add(v);
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

  flush(path: Path = emptyPath, outPatch: Patch = []): Patch {
    if (this.#dirty) {
      this.#dirty = false;
      outPatch.push({
        op: PatchOpCode.SetReplace,
        path,
        values: Array.from(this), // Copy so future mutations won't affect the patch
      });
    }
    return outPatch;
  }
}

export class TrackedMap<K extends PathSegment, V>
  extends Map<K, V>
  implements Tracker
{
  // Track dirty "set" and "delete" keys to be able to produce the most minimal patch
  #setKeys: Set<K>;
  #deleteKeys: Set<K>;

  constructor(entries?: readonly (readonly [K, V])[] | null) {
    // Must call super with no arguments since our overrides access private properties
    super();

    this.#setKeys = new Set();
    this.#deleteKeys = new Set();
    if (entries) {
      for (const [k, v] of entries) {
        super.set(k, v);
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
    this.#deleteKeys.add(key);
    this.#setKeys.delete(key);
    return super.delete(key);
  }

  flush(path: Path = emptyPath, outPatch: Patch = []): Patch {
    if (this.#setKeys.size || this.#deleteKeys.size) {
      for (const key of this.#setKeys) {
        outPatch.push({
          op: PatchOpCode.MapSet,
          path,
          key,
          value: this.get(key),
        });
      }
      for (const key of this.#deleteKeys) {
        outPatch.push({
          op: PatchOpCode.MapDelete,
          path,
          key,
        });
      }
    }
    return outPatch;
  }
}

const emptyPath: Path = Object.freeze([]);
