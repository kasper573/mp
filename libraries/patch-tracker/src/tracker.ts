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

/**
 * Base class for tracking operations and building JSON-Pointer paths.
 */
class Tracker {
  protected changes: Operation[] = [];

  protected makePath(path: Array<string | number>): string {
    if (path.length === 0) return "";
    return "/" + path.map((seg) => encodeURIComponent(String(seg))).join("/");
  }

  /**
   * Return and clear recorded operations.
   */
  public flush(): Patch {
    const ops = [...this.changes];
    this.changes.length = 0;
    return ops;
  }
}

/**
 * Tracks mutations to an object by defining getters/setters per property.
 */
export class TrackedObject<T extends object> extends Tracker {
  constructor(
    private typeInfo: ObjectNode | ObjectUnionNode,
    private path: Array<string | number>,
    initial: T,
  ) {
    super();
    // bind flush to this instance
    Object.defineProperty(this, "flush", {
      value: this.flush,
      writable: false,
    });

    // collect properties from Object or Union
    const props: Record<string, TypeNode> =
      this.typeInfo.type === "Object"
        ? this.typeInfo.properties
        : this.unionProperties();

    for (const key of Object.keys(props)) {
      const childType = props[key];
      let value = (initial as any)[key];

      Object.defineProperty(this, key, {
        enumerable: true,
        configurable: true,
        get: () => wrapValue(this, [...this.path, key], childType, value),
        set: (v) => {
          const ptr = this.makePath([...this.path, key]);
          this.changes.push({ op: PatchOpCode.Replace, path: ptr, value: v });
          value = v;
        },
      });
    }
  }

  private unionProperties(): Record<string, TypeNode> {
    const out: Record<string, TypeNode> = {};
    for (const member of (this.typeInfo as ObjectUnionNode).members) {
      for (const [k, t] of Object.entries(member.properties)) {
        out[k] = t;
      }
    }
    return out;
  }
}

/**
 * Tracks mutations to an array by overriding mutator methods and index writes.
 */
export class TrackedArray extends Tracker {
  constructor(
    private node: ArrayNode,
    private path: Array<string | number>,
    initial: unknown[],
  ) {
    super();
    // initialize elements
    initial.forEach((v, i) => {
      (this as any)[i] = wrapValue(this, [...this.path, i], this.node.value, v);
    });
    // set initial length
    Object.defineProperty(this, "length", {
      value: initial.length,
      writable: true,
      configurable: true,
      enumerable: false,
    });
  }

  public push(...items: unknown[]): number {
    const wrapped = items.map((v, i) =>
      wrapValue(this, [...this.path, this.length + i], this.node.value, v),
    );
    const newLen = (Array.prototype.push as Function).apply(this, wrapped);
    this.changes.push({
      op: PatchOpCode.Replace,
      path: this.makePath(this.path),
      value: Array.from(this) as unknown,
    });
    return newLen;
  }

  public pop(): unknown {
    const res = (Array.prototype.pop as Function).apply(this);
    this.changes.push({
      op: PatchOpCode.Replace,
      path: this.makePath(this.path),
      value: Array.from(this) as unknown,
    });
    return res;
  }

  public shift(): unknown {
    const res = (Array.prototype.shift as Function).apply(this);
    this.changes.push({
      op: PatchOpCode.Replace,
      path: this.makePath(this.path),
      value: Array.from(this) as unknown,
    });
    return res;
  }

  public unshift(...items: unknown[]): number {
    const wrapped = items.map((v, i) =>
      wrapValue(this, [...this.path, i], this.node.value, v),
    );
    const newLen = (Array.prototype.unshift as Function).apply(this, wrapped);
    this.changes.push({
      op: PatchOpCode.Replace,
      path: this.makePath(this.path),
      value: Array.from(this) as unknown,
    });
    return newLen;
  }

  public splice(
    start: number,
    deleteCount?: number,
    ...items: unknown[]
  ): unknown[] {
    const wrapped = items.map((v, i) =>
      wrapValue(this, [...this.path, start + i], this.node.value, v),
    );
    const res = (Array.prototype.splice as Function).apply(this, [
      start,
      deleteCount,
      ...wrapped,
    ]);
    this.changes.push({
      op: PatchOpCode.Replace,
      path: this.makePath(this.path),
      value: Array.from(this) as unknown,
    });
    return res as unknown[];
  }

  /**
   * Manually assign an index.
   */
  public setIndex(index: number, value: unknown): void {
    const wrapped = wrapValue(
      this,
      [...this.path, index],
      this.node.value,
      value,
    );
    (this as any)[index] = wrapped;
    this.changes.push({
      op: PatchOpCode.Replace,
      path: this.makePath([...this.path, index]),
      value,
    });
  }
}

/**
 * Tracks mutations to a Map by overriding set and delete.
 */
export class TrackedMap extends Tracker implements Map<unknown, unknown> {
  constructor(
    private node: MapNode,
    private path: Array<string | number>,
    initial: Map<unknown, unknown>,
  ) {
    super();
    initial.forEach((v, k) => this.set(k, v));
  }

  public get size(): number {
    // @ts-ignore
    return Map.prototype.size.call(this);
  }

  public has(key: unknown): boolean {
    return Map.prototype.has.call(this, key);
  }

  public get(key: unknown): unknown {
    return Map.prototype.get.call(this, key);
  }

  public set(key: unknown, value: unknown): this {
    const wrapped = wrapValue(
      this,
      [...this.path, String(key)],
      this.node.value,
      value,
    );
    this.changes.push({
      op: PatchOpCode.Replace,
      path: this.makePath([...this.path, String(key)]),
      value,
    });
    Map.prototype.set.call(this, key, wrapped);
    return this;
  }

  public delete(key: unknown): boolean {
    this.changes.push({
      op: PatchOpCode.Delete,
      path: this.makePath([...this.path, String(key)]),
    });
    return Map.prototype.delete.call(this, key);
  }

  public clear(): void {
    Map.prototype.clear.call(this);
  }

  public keys(): IterableIterator<unknown> {
    return Map.prototype.keys.call(this);
  }

  public values(): IterableIterator<unknown> {
    return Map.prototype.values.call(this);
  }

  public entries(): IterableIterator<[unknown, unknown]> {
    return Map.prototype.entries.call(this);
  }

  [Symbol.iterator](): IterableIterator<[unknown, unknown]> {
    return this.entries();
  }
}

/**
 * Tracks mutations to a Set by overriding add and delete.
 */
export class TrackedSet extends Tracker implements Set<unknown> {
  constructor(
    private node: SetNode,
    private path: Array<string | number>,
    initial: Set<unknown>,
  ) {
    super();
    initial.forEach((v) => this.add(v));
  }

  public get size(): number {
    // @ts-ignore
    return Set.prototype.size.call(this);
  }

  public has(value: unknown): boolean {
    return Set.prototype.has.call(this, value);
  }

  public add(value: unknown): this {
    const res = Set.prototype.add.call(this, value);
    this.changes.push({
      op: PatchOpCode.Replace,
      path: this.makePath(this.path),
      value: Array.from(this) as unknown,
    });
    return this;
  }

  public delete(value: unknown): boolean {
    const res = Set.prototype.delete.call(this, value);
    this.changes.push({
      op: PatchOpCode.Replace,
      path: this.makePath(this.path),
      value: Array.from(this) as unknown,
    });
    return res;
  }

  public clear(): void {
    Set.prototype.clear.call(this);
  }

  public keys(): IterableIterator<unknown> {
    return Set.prototype.keys.call(this);
  }

  public values(): IterableIterator<unknown> {
    return Set.prototype.values.call(this);
  }

  public entries(): IterableIterator<[unknown, unknown]> {
    return Set.prototype.entries.call(this);
  }

  [Symbol.iterator](): IterableIterator<unknown> {
    return this.values();
  }
}

/**
 * Wraps a value based on TypeNode, producing a tracked instance when needed.
 */
export function wrapValue(
  root: Tracker,
  path: Array<string | number>,
  node: TypeNode,
  value: unknown,
): unknown {
  switch (node.type) {
    case "Primitive":
      return value;
    case "Object":
    case "Union":
      return new TrackedObject(node as any, path, value as object);
    case "Array":
      return new TrackedArray(node as any, path, value as unknown[]);
    case "Map":
      return new TrackedMap(node as any, path, value as Map<unknown, unknown>);
    case "Set":
      return new TrackedSet(node as any, path, value as Set<unknown>);
  }
}
