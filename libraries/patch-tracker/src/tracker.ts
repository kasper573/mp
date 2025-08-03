import type { Patch } from "@mp/patch";
import { PatchOpCode } from "@mp/patch";

export type TrackedObjectConstructor<T extends object> = new (
  initial: T,
) => TrackedObject<T>;

export type TrackedObject<T extends object> = T & Tracker;

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
  #patch: Patch = [];

  constructor(trackedPropertyNames: Path, object: Record<string, unknown>) {
    for (const prop of trackedPropertyNames) {
      Object.defineProperty(this, prop, {
        enumerable: true,
        configurable: true,
        get: () => object[prop],
        set: (value) => {
          this.#patch.push({
            op: PatchOpCode.ObjectPropertySet,
            path: emptyPath,
            prop,
            value,
          });
          object[prop] = value;
        },
      });
    }
  }

  flush(prefix?: Path, outPatch?: Patch): Patch {
    return transferPatch(this.#patch, prefix, outPatch);
  }
}

export class TrackedArray<V> extends Array<V> implements Tracker {
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

  flush(prefix: Path = emptyPath, outPatch: Patch = []): Patch {
    if (this.#dirty) {
      this.#dirty = false;
      outPatch.push({
        op: PatchOpCode.ArrayReplace,
        path: prefix ?? emptyPath,
        elements: this.slice(),
      });
    }
    return outPatch;
  }
}

export class TrackedSet<V> extends Set<V> implements Tracker {
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

  flush(prefix: Path = emptyPath, outPatch: Patch = []): Patch {
    if (this.#dirty) {
      this.#dirty = false;
      outPatch.push({
        op: PatchOpCode.SetReplace,
        path: prefix ?? emptyPath,
        values: Array.from(this),
      });
    }
    return outPatch;
  }
}

export class TrackedMap<K extends PathSegment, V>
  extends Map<K, V>
  implements Tracker
{
  #patch: Patch;

  constructor(entries?: readonly (readonly [K, V])[] | null) {
    // Must call super with no arguments since our overrides access private properties
    super();

    this.#patch = [];
    if (entries) {
      for (const [k, v] of entries) {
        super.set(k, v);
      }
    }
  }

  override set(key: K, value: V): this {
    this.#patch.push({
      op: PatchOpCode.MapSet,
      path: emptyPath,
      key,
      value,
    });
    super.set(key, value);
    return this;
  }

  override delete(key: K): boolean {
    this.#patch.push({
      op: PatchOpCode.MapDelete,
      path: emptyPath,
      key,
    });
    return super.delete(key);
  }

  flush(prefix?: Path, outPatch?: Patch): Patch {
    return transferPatch(this.#patch, prefix, outPatch);
  }
}

const emptyPath: Path = Object.freeze([]);

type Path = readonly PathSegment[];
type PathSegment = string | number;

function transferPatch(
  from: Patch = [],
  prefix: Path = [],
  to: Patch = [],
): Patch {
  for (const op of from) {
    op.path = [...prefix, ...op.path];
    to.push(op);
  }
  from.splice(0, from.length); // Clear the original patch
  return to;
}

export interface Tracker {
  flush(prefix?: Path, outPatch?: Patch): Patch;
}
