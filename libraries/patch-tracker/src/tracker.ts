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

abstract class TrackerBase {
  protected changes: Operation[] = [];

  protected makePath(segments: Array<string | number>): string {
    if (segments.length === 0) return "";
    return "/" + segments.map((s) => encodeURIComponent(String(s))).join("/");
  }

  flush(): Patch {
    const out = [...this.changes];
    this.changes.length = 0;
    return out;
  }
}

export class TrackedObject<T extends object> extends TrackerBase {
  private values: Record<string, unknown>;

  constructor(
    private typeInfo: ObjectNode | ObjectUnionNode,
    private path: Array<string | number>,
    initial: T,
  ) {
    super();
    // bind flush to the instance
    Object.defineProperty(this, "flush", {
      value: this.flush,
      writable: false,
    });
    // clone initial values
    this.values = { ...(initial as object) };

    // collect all properties from Object or Union
    const props: Record<string, TypeNode> =
      typeInfo.type === "Object"
        ? typeInfo.properties
        : (typeInfo as ObjectUnionNode).members.reduce(
            (acc, m) => {
              Object.assign(acc, m.properties);
              return acc;
            },
            {} as Record<string, TypeNode>,
          );

    // define getters/setters for each prop
    for (const key of Object.keys(props)) {
      const childType = props[key];
      Object.defineProperty(this, key, {
        enumerable: true,
        configurable: true,
        get: () =>
          wrapValue(this, [...this.path, key], childType, this.values[key]),
        set: (v: unknown) => {
          const ptr = this.makePath([...this.path, key]);
          this.changes.push({
            op: PatchOpCode.Replace,
            path: ptr,
            value: v,
          });
          this.values[key] = v;
        },
      });
    }
  }
}

export class TrackedArray extends TrackerBase {
  private arr: unknown[];
  private node: ArrayNode;
  private path: Array<string | number>;

  constructor(
    node: ArrayNode,
    path: Array<string | number>,
    initial: unknown[],
  ) {
    super();
    this.node = node;
    this.path = path;
    // copy and wrap each element
    this.arr = initial.map((v, i) =>
      wrapValue(this, [...path, i], node.value, v),
    );
  }

  push(...items: unknown[]): number {
    const wrapped = items.map((v, i) =>
      wrapValue(this, [...this.path, this.arr.length + i], this.node.value, v),
    );
    const res = this.arr.push(...wrapped);
    this.changes.push({
      op: PatchOpCode.Replace,
      path: this.makePath(this.path),
      value: [...this.arr],
    });
    return res;
  }
  pop(): unknown {
    const res = this.arr.pop();
    this.changes.push({
      op: PatchOpCode.Replace,
      path: this.makePath(this.path),
      value: [...this.arr],
    });
    return res;
  }
  shift(): unknown {
    const res = this.arr.shift();
    this.changes.push({
      op: PatchOpCode.Replace,
      path: this.makePath(this.path),
      value: [...this.arr],
    });
    return res;
  }
  unshift(...items: unknown[]): number {
    const wrapped = items.map((v, i) =>
      wrapValue(this, [...this.path, i], this.node.value, v),
    );
    const res = this.arr.unshift(...wrapped);
    this.changes.push({
      op: PatchOpCode.Replace,
      path: this.makePath(this.path),
      value: [...this.arr],
    });
    return res;
  }
  splice(start: number, deleteCount?: number, ...items: unknown[]): unknown[] {
    const wrapped = items.map((v, i) =>
      wrapValue(this, [...this.path, start + i], this.node.value, v),
    );
    const res = this.arr.splice(start, deleteCount as number, ...wrapped);
    this.changes.push({
      op: PatchOpCode.Replace,
      path: this.makePath(this.path),
      value: [...this.arr],
    });
    return res;
  }
  setIndex(index: number, value: unknown): void {
    const wrapped = wrapValue(
      this,
      [...this.path, index],
      this.node.value,
      value,
    );
    this.arr[index] = wrapped;
    this.changes.push({
      op: PatchOpCode.Replace,
      path: this.makePath([...this.path, index]),
      value,
    });
  }
}

/**
 * Tracks Map mutations by subclassing Map.
 */
export class TrackedMap extends Map<unknown, unknown> {
  private changes: Operation[] = [];
  private node: MapNode;
  private path: Array<string | number>;

  constructor(
    node: MapNode,
    path: Array<string | number>,
    initial: Map<unknown, unknown>,
  ) {
    super();
    this.node = node;
    this.path = path;
    // populate without recording initial ops
    initial.forEach((v, k) => {
      const wrapped = wrapValue(
        this,
        [...this.path, String(k)],
        this.node.value,
        v,
      );
      super.set(k, wrapped);
    });
  }

  flush(): Patch {
    const out = [...this.changes];
    this.changes.length = 0;
    return out;
  }

  private makePath(segments: Array<string | number>): string {
    if (segments.length === 0) return "";
    return "/" + segments.map((s) => encodeURIComponent(String(s))).join("/");
  }

  override set(key: unknown, value: unknown): this {
    const wrapped = wrapValue(
      this,
      [...this.path, String(key)],
      this.node.value,
      value,
    );
    const ptr = this.makePath([...this.path, String(key)]);
    this.changes.push({ op: PatchOpCode.Replace, path: ptr, value });
    super.set(key, wrapped);
    return this;
  }

  override delete(key: unknown): boolean {
    const ptr = this.makePath([...this.path, String(key)]);
    this.changes.push({ op: PatchOpCode.Delete, path: ptr });
    return super.delete(key);
  }
}

/**
 * Tracks Set mutations by subclassing Set.
 */
export class TrackedSet extends Set<unknown> {
  private changes: Operation[] = [];
  private node: SetNode;
  private path: Array<string | number>;

  constructor(
    node: SetNode,
    path: Array<string | number>,
    initial: Set<unknown>,
  ) {
    super();
    this.node = node;
    this.path = path;
    // populate without recording initial ops
    initial.forEach((v) => super.add(v));
  }

  flush(): Patch {
    const out = [...this.changes];
    this.changes.length = 0;
    return out;
  }

  private makePath(segments: Array<string | number>): string {
    if (segments.length === 0) return "";
    return "/" + segments.map((s) => encodeURIComponent(String(s))).join("/");
  }

  override add(value: unknown): this {
    super.add(value);
    this.changes.push({
      op: PatchOpCode.Replace,
      path: this.makePath(this.path),
      value: Array.from(this),
    });
    return this;
  }

  override delete(value: unknown): boolean {
    const res = super.delete(value);
    this.changes.push({
      op: PatchOpCode.Replace,
      path: this.makePath(this.path),
      value: Array.from(this),
    });
    return res;
  }
}

function wrapValue(
  root: unknown,
  path: Array<string | number>,
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
