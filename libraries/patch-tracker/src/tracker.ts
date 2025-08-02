import type { Operation, Patch } from "@mp/patch";
import { PatchOpCode } from "@mp/patch";

export class TrackedObject<T extends object> implements Tracker {
  #patch: Patch = [];

  constructor(trackedPropertyNames: string[], object: T) {
    for (const key of trackedPropertyNames) {
      Object.defineProperty(this, key, {
        enumerable: true,
        configurable: true,
        set: (v: unknown) => {
          this.#patch.push({
            op: PatchOpCode.Replace,
            path: segmentToJSONPointer(key),
            value: v,
          });
          object[key as keyof T] = v as T[keyof T];
        },
      });
    }
  }

  flush(prefix?: PathSegment[], outPatch?: Patch): Patch {
    return transferPatch(this.#patch, prefix, outPatch);
  }
}

export class TrackedArray<V> extends Array<V> {
  #patch: Operation[] = [];

  constructor(...items: V[]) {
    super();
    this.#patch = [];
    for (const item of items) {
      super.push(item);
    }
  }

  override push(...items: V[]): number {
    const res = super.push(...items);
    this.#patch.push({
      op: PatchOpCode.Replace,
      path: emptyPath,
      value: super.slice(),
    });
    return res;
  }

  override pop(): V | undefined {
    const res = super.pop();
    this.#patch.push({
      op: PatchOpCode.Replace,
      path: emptyPath,
      value: super.slice(),
    });
    return res;
  }

  override shift(): V | undefined {
    const res = super.shift();
    this.#patch.push({
      op: PatchOpCode.Replace,
      path: emptyPath,
      value: super.slice(),
    });
    return res;
  }

  override unshift(...items: V[]): number {
    const res = super.unshift(...items);
    this.#patch.push({
      op: PatchOpCode.Replace,
      path: emptyPath,
      value: super.slice(),
    });
    return res;
  }

  override splice(start: number, deleteCount?: number, ...items: V[]): V[] {
    const res = super.splice(start, deleteCount as number, ...items);
    this.#patch.push({
      op: PatchOpCode.Replace,
      path: emptyPath,
      value: super.slice(),
    });
    return res;
  }

  flush(prefix?: PathSegment[], outPatch?: Patch): Patch {
    return transferPatch(this.#patch, prefix, outPatch);
  }
}

export class TrackedMap<K, V> extends Map<K, V> implements Tracker {
  #patch: Patch;

  constructor(entries?: readonly (readonly [K, V])[] | null) {
    super();

    this.#patch = [];
    if (entries) {
      for (const [k, v] of entries) {
        super.set(k, v);
      }
    }
  }

  override set(key: K, value: V): this {
    const keyStr = String(key);
    this.#patch.push({
      op: PatchOpCode.Replace,
      path: segmentToJSONPointer(keyStr),
      value,
    });
    super.set(key, value);
    return this;
  }

  override delete(key: K): boolean {
    const keyStr = String(key);
    this.#patch.push({
      op: PatchOpCode.Delete,
      path: segmentToJSONPointer(keyStr),
    });
    return super.delete(key);
  }

  flush(prefix?: PathSegment[], outPatch?: Patch): Patch {
    return transferPatch(this.#patch, prefix, outPatch);
  }
}

export class TrackedSet<V> extends Set<V> implements Tracker {
  #patch: Operation[] = [];

  constructor(initial?: Iterable<V>) {
    super();
    this.#patch = [];
    if (initial) {
      for (const v of initial) {
        super.add(v);
      }
    }
  }

  override add(value: V): this {
    super.add(value);
    this.#patch.push({
      op: PatchOpCode.Replace,
      path: emptyPath,
      value: Array.from(this),
    });
    return this;
  }

  override delete(value: V): boolean {
    const res = super.delete(value);
    this.#patch.push({
      op: PatchOpCode.Replace,
      path: emptyPath,
      value: Array.from(this),
    });
    return res;
  }

  flush(prefix?: PathSegment[], outPatch?: Patch): Patch {
    return transferPatch(this.#patch, prefix, outPatch);
  }
}

function segmentToJSONPointer(segment: PathSegment): string {
  return encodeURIComponent(String(segment));
}

function pathToJSONPointer(path: PathSegment[]): string {
  if (!path.length) {
    return emptyPath;
  }
  return path.map((seg) => `/${segmentToJSONPointer(seg)}`).join("");
}

type PathSegment = string | number;

const emptyPath = "";

function transferPatch(
  from: Patch = [],
  prefix: PathSegment[] = [],
  to: Patch = [],
): Patch {
  for (const op of from) {
    op.path = pathToJSONPointer([...prefix, ...op.path]);
    to.push(op);
  }
  from.splice(0, from.length); // Clear the original patch
  return to;
}

export interface Tracker {
  flush(prefix?: PathSegment[], outPatch?: Patch): Patch;
}
