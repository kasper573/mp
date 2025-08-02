import type { Operation, Patch } from "@mp/patch";
import { PatchOpCode } from "@mp/patch";
import type {
  ArrayNode,
  MapNode,
  ObjectNode,
  ObjectUnionNode,
  SetNode,
  TypeNode,
} from "./graph";

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

    // Bind flush for external callers
    Object.defineProperty(this, "flush", {
      value: this.flush.bind(this),
      writable: false,
    });

    // Clone initial values
    this.values = { ...(initial as object) };

    // Collect properties
    const props: Record<string, TypeNode> =
      typeInfo.type === "Object"
        ? typeInfo.properties
        : (typeInfo as ObjectUnionNode).members.reduce(
            (acc, m) => Object.assign(acc, m.properties),
            {} as Record<string, TypeNode>,
          );

    // Pre-encode property keys
    this.encodedKeys = {};
    for (const key of Object.keys(props)) {
      this.encodedKeys[key] = encodePath(key);
    }

    // Define getter/setter hooks
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

export class TrackedArray extends TrackerBase {
  private arr: unknown[];
  private basePath: string;

  constructor(
    private node: ArrayNode,
    private path: PathSegment[],
    initial: unknown[],
  ) {
    super();
    this.basePath = buildPath(path);
    this.arr = initial.map((v, i) => wrapValue([...path, i], node.value, v));
  }

  push(...items: unknown[]): number {
    const start = this.arr.length;
    const wrapped = items.map((v, i) =>
      wrapValue([...this.path, start + i], this.node.value, v),
    );
    const res = this.arr.push(...wrapped);
    // Snapshot only when recording
    this.changes.push({
      op: PatchOpCode.Replace,
      path: this.basePath,
      value: this.arr.slice(),
    });
    return res;
  }

  pop(): unknown {
    const res = this.arr.pop();
    this.changes.push({
      op: PatchOpCode.Replace,
      path: this.basePath,
      value: this.arr.slice(),
    });
    return res;
  }

  shift(): unknown {
    const res = this.arr.shift();
    this.changes.push({
      op: PatchOpCode.Replace,
      path: this.basePath,
      value: this.arr.slice(),
    });
    return res;
  }

  unshift(...items: unknown[]): number {
    const wrapped = items.map((v, i) =>
      wrapValue([...this.path, i], this.node.value, v),
    );
    const res = this.arr.unshift(...wrapped);
    this.changes.push({
      op: PatchOpCode.Replace,
      path: this.basePath,
      value: this.arr.slice(),
    });
    return res;
  }

  splice(start: number, deleteCount?: number, ...items: unknown[]): unknown[] {
    const wrapped = items.map((v, i) =>
      wrapValue([...this.path, start + i], this.node.value, v),
    );
    const res = this.arr.splice(start, deleteCount as number, ...wrapped);
    this.changes.push({
      op: PatchOpCode.Replace,
      path: this.basePath,
      value: this.arr.slice(),
    });
    return res;
  }

  setIndex(index: number, value: unknown): void {
    const wrapped = wrapValue([...this.path, index], this.node.value, value);
    this.arr[index] = wrapped;
    const ptr = this.basePath + "/" + encodePath(index);
    this.changes.push({
      op: PatchOpCode.Replace,
      path: ptr,
      value,
    });
  }
}

export class TrackedMap extends Map<unknown, unknown> {
  private changes: Operation[] = [];
  private basePath: string;

  constructor(
    private node: MapNode,
    private path: PathSegment[],
    initial: Map<unknown, unknown>,
  ) {
    super();
    this.basePath = buildPath(path);
    initial.forEach((v, k) => {
      super.set(k, wrapValue([...path, String(k)], this.node.value, v));
    });
  }

  flush(): Patch {
    const out = this.changes;
    this.changes = [];
    return out;
  }

  override set(key: unknown, value: unknown): this {
    const keyStr = String(key);
    const ptr = this.basePath + "/" + encodePath(keyStr);
    this.changes.push({ op: PatchOpCode.Replace, path: ptr, value });
    super.set(key, wrapValue([...this.path, keyStr], this.node.value, value));
    return this;
  }

  override delete(key: unknown): boolean {
    const keyStr = String(key);
    const ptr = this.basePath + "/" + encodePath(keyStr);
    this.changes.push({ op: PatchOpCode.Delete, path: ptr });
    return super.delete(key);
  }
}

export class TrackedSet extends Set<unknown> {
  private changes: Operation[] = [];
  private basePath: string;

  constructor(node: SetNode, path: PathSegment[], initial: Set<unknown>) {
    super();
    this.basePath = buildPath(path);
    initial.forEach((v) => super.add(v));
  }

  flush(): Patch {
    const out = this.changes;
    this.changes = [];
    return out;
  }

  override add(value: unknown): this {
    super.add(value);
    this.changes.push({
      op: PatchOpCode.Replace,
      path: this.basePath,
      value: Array.from(this),
    });
    return this;
  }

  override delete(value: unknown): boolean {
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
      return new TrackedArray(node, path, value as unknown[]);
    case "Map":
      return new TrackedMap(node, path, value as Map<unknown, unknown>);
    case "Set":
      return new TrackedSet(node, path, value as Set<unknown>);
  }
}

function encodePath(segment: PathSegment): string {
  return encodeURIComponent(String(segment));
}

function buildPath(segments: PathSegment[]): string {
  if (!segments.length) return "";
  let path = "";
  for (const seg of segments) {
    path += "/" + encodePath(seg);
  }
  return path;
}
