import type { Operation, Patch } from "@mp/patch";
import { PatchOpCode } from "@mp/patch";
import type { ObjectNode, ObjectUnionNode, TypeNode } from "./graph";

type PathSegment = string | number;

abstract class TrackerBase {
  protected changes: Operation[] = [];

  flush(): Patch {
    const out = this.changes;
    this.changes = [];
    return out;
  }
}

export class TrackedObject<T extends object> extends TrackerBase {
  private values: Record<string, unknown>;
  private wrapperCache: Record<string, unknown> = {};
  private encodedKeys: Record<string, string>;
  private basePath: string;

  constructor(
    typeInfo: ObjectNode | ObjectUnionNode,
    private path: PathSegment[],
    initial: T,
  ) {
    super();
    this.basePath = buildPath(path);

    Object.defineProperty(this, "flush", {
      value: this.flush.bind(this),
      writable: false,
    });

    this.values = { ...(initial as object) };

    const props: Record<string, TypeNode> =
      typeInfo.type === "Object"
        ? typeInfo.properties
        : (typeInfo as ObjectUnionNode).members.reduce(
            (acc, m) => Object.assign(acc, m.properties),
            {} as Record<string, TypeNode>,
          );

    this.encodedKeys = {};
    for (const key of Object.keys(props)) {
      this.encodedKeys[key] = encodePath(key);
    }

    for (const key of Object.keys(props)) {
      const childType = props[key];
      Object.defineProperty(this, key, {
        enumerable: true,
        configurable: true,
        get: () => {
          if (this.wrapperCache[key] !== undefined) {
            return this.wrapperCache[key];
          }
          const childPath = [...this.path, key];
          const wrapped = wrapValue(childPath, childType, this.values[key]);
          this.wrapperCache[key] = wrapped;
          return wrapped;
        },
        set: (v: unknown) => {
          const ptr = this.basePath + "/" + this.encodedKeys[key];
          this.changes.push({
            op: PatchOpCode.Replace,
            path: ptr,
            value: v,
          });
          this.values[key] = v;
          delete this.wrapperCache[key];
        },
      });
    }
  }
}

export class TrackedArray<V> extends TrackerBase {
  private arr: V[];
  private basePath: string;

  constructor(
    private path: PathSegment[],
    initial: V[],
  ) {
    super();
    this.basePath = buildPath(path);
    this.arr = initial.slice();
  }

  push(...items: V[]): number {
    const res = this.arr.push(...items);
    this.changes.push({
      op: PatchOpCode.Replace,
      path: this.basePath,
      value: this.arr.slice(),
    });
    return res;
  }

  pop(): V | undefined {
    const res = this.arr.pop();
    this.changes.push({
      op: PatchOpCode.Replace,
      path: this.basePath,
      value: this.arr.slice(),
    });
    return res;
  }

  shift(): V | undefined {
    const res = this.arr.shift();
    this.changes.push({
      op: PatchOpCode.Replace,
      path: this.basePath,
      value: this.arr.slice(),
    });
    return res;
  }

  unshift(...items: V[]): number {
    const res = this.arr.unshift(...items);
    this.changes.push({
      op: PatchOpCode.Replace,
      path: this.basePath,
      value: this.arr.slice(),
    });
    return res;
  }

  splice(start: number, deleteCount?: number, ...items: V[]): V[] {
    const res = this.arr.splice(start, deleteCount as number, ...items);
    this.changes.push({
      op: PatchOpCode.Replace,
      path: this.basePath,
      value: this.arr.slice(),
    });
    return res;
  }

  setIndex(index: number, value: V): void {
    this.arr[index] = value;
    const ptr = this.basePath + "/" + encodePath(index);
    this.changes.push({
      op: PatchOpCode.Replace,
      path: ptr,
      value,
    });
  }
}

export class TrackedMap<K, V> extends Map<K, V> {
  private changes: Operation[] = [];
  private basePath: string;

  constructor(path: PathSegment[], initial: Map<K, V>) {
    super();
    this.basePath = buildPath(path);
    initial.forEach((v, k) => {
      super.set(k, v);
    });
  }

  flush(): Patch {
    const out = this.changes;
    this.changes = [];
    return out;
  }

  override set(key: K, value: V): this {
    const keyStr = String(key);
    const ptr = this.basePath + "/" + encodePath(keyStr);
    this.changes.push({ op: PatchOpCode.Replace, path: ptr, value });
    super.set(key, value);
    return this;
  }

  override delete(key: K): boolean {
    const keyStr = String(key);
    const ptr = this.basePath + "/" + encodePath(keyStr);
    this.changes.push({ op: PatchOpCode.Delete, path: ptr });
    return super.delete(key);
  }
}

export class TrackedSet<V> extends Set<V> {
  private changes: Operation[] = [];
  private basePath: string;

  constructor(path: PathSegment[], initial: Set<V>) {
    super();
    this.basePath = buildPath(path);
    initial.forEach((v) => super.add(v));
  }

  flush(): Patch {
    const out = this.changes;
    this.changes = [];
    return out;
  }

  override add(value: V): this {
    super.add(value);
    this.changes.push({
      op: PatchOpCode.Replace,
      path: this.basePath,
      value: Array.from(this),
    });
    return this;
  }

  override delete(value: V): boolean {
    const res = super.delete(value);
    this.changes.push({
      op: PatchOpCode.Replace,
      path: this.basePath,
      value: Array.from(this),
    });
    return res;
  }
}

function wrapValue(
  path: PathSegment[],
  node: TypeNode,
  value: unknown,
): unknown {
  switch (node.type) {
    case "Primitive":
      return value;
    case "Object":
    case "Union":
      return new TrackedObject(node, path, value as object);
    case "Array":
      return new TrackedArray(path, value as unknown[]);
    case "Map":
      return new TrackedMap(path, value as Map<unknown, unknown>);
    case "Set":
      return new TrackedSet(path, value as Set<unknown>);
  }
}

function encodePath(segment: PathSegment): string {
  return encodeURIComponent(String(segment));
}

function buildPath(segments: PathSegment[]): string {
  if (!segments.length) return "";
  return segments.map((seg) => `/${encodePath(seg)}`).join("");
}
