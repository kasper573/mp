import {
  isObjectType,
  type ObjectType,
  RiftTypeKind,
  type InferValue,
  type RiftType,
} from "@rift/types";
import type { EntityId } from "./protocol";
import type { RiftSchema } from "./schema";

export class World {
  readonly schema: RiftSchema;
  readonly #entities = new Set<EntityId>();
  readonly #pools = new Map<RiftType, Pool<unknown>>();
  readonly #handlers = new Set<LocalWorldEventHandler>();
  #nextId = 1;

  constructor(schema: RiftSchema) {
    this.schema = schema;
    for (const type of schema.components) {
      this.#pools.set(type, new Pool(type));
    }
  }

  create(id?: EntityId): EntityId {
    if (id !== undefined) {
      if (!this.#entities.has(id)) {
        this.#entities.add(id);
        if (id >= this.#nextId) {
          this.#nextId = id + 1;
        }
        this.#emit({ type: "entityCreated", id });
      }
      return id;
    }
    const next = this.#nextId++ as EntityId;
    this.#entities.add(next);
    this.#emit({ type: "entityCreated", id: next });
    return next;
  }

  destroy(...ids: readonly EntityId[]): void {
    for (const id of ids) {
      if (!this.#entities.delete(id)) {
        continue;
      }
      for (const [component, pool] of this.#pools) {
        if (pool.remove(id)) {
          this.#emit({ type: "componentRemoved", id, component });
        }
      }
      this.#emit({ type: "entityDestroyed", id });
    }
  }

  exists(id: EntityId): boolean {
    return this.#entities.has(id);
  }

  has(
    id: EntityId,
    ...types: readonly [RiftType, ...(readonly RiftType[])]
  ): boolean {
    for (const t of types) {
      if (!this.#poolOf(t).values.has(id)) {
        return false;
      }
    }
    return true;
  }

  get<T>(id: EntityId, type: RiftType<T>): T | undefined;
  get<
    const Types extends readonly [RiftType, RiftType, ...(readonly RiftType[])],
  >(
    id: EntityId,
    ...types: Types
  ): { [K in keyof Types]: InferValue<Types[K]> | undefined };
  get(id: EntityId, ...types: readonly RiftType[]): unknown {
    if (types.length === 1) {
      return this.#poolOf(types[0]).values.get(id);
    }
    const out = new Array<unknown>(types.length);
    for (let i = 0; i < types.length; i++) {
      out[i] = this.#poolOf(types[i]).values.get(id);
    }
    return out;
  }

  add<T>(id: EntityId, type: RiftType<T>, value: T): T {
    if (!this.#entities.has(id)) {
      throw new Error(`entity ${id} does not exist`);
    }
    const pool = this.#poolOf(type);
    if (pool.values.has(id)) {
      throw new Error(`entity ${id} already has component`);
    }
    pool.add(id, value);
    this.#emit({ type: "componentAdded", id, component: type });
    return value;
  }

  write<T>(id: EntityId, type: RiftType<T>, partial: Partial<T>): void {
    const pool = this.#poolOf(type);
    const result = pool.write(id, partial);
    if (result === "missing") {
      throw new Error(`entity ${id} does not have component`);
    }
    if (result === "changed") {
      this.#emit({ type: "componentChanged", id, component: type });
    }
  }

  upsert<T>(id: EntityId, type: RiftType<T>, value: T): void {
    if (this.#poolOf(type).values.has(id)) {
      this.write(id, type, value);
    } else {
      this.add(id, type, value);
    }
  }

  remove(
    id: EntityId,
    ...types: readonly [RiftType, ...(readonly RiftType[])]
  ): void {
    for (const t of types) {
      if (this.#poolOf(t).remove(id)) {
        this.#emit({ type: "componentRemoved", id, component: t });
      }
    }
  }

  query<const Types extends readonly RiftType[]>(
    ...types: Types
  ): QueryView<Types> {
    return createQueryView(this, types, []);
  }

  on(handler: LocalWorldEventHandler): () => void {
    this.#handlers.add(handler);
    return () => {
      this.#handlers.delete(handler);
    };
  }

  pool<T>(type: RiftType<T>): Pool<T> {
    return this.#poolOf(type);
  }

  // Without args, returns the full set (no allocation). With component
  // types, returns a fresh array of matching IDs.
  entities(): ReadonlySet<EntityId>;
  entities(...types: readonly RiftType[]): EntityId[];
  entities(...types: readonly RiftType[]): ReadonlySet<EntityId> | EntityId[] {
    if (types.length === 0) {
      return this.#entities;
    }
    const ids: EntityId[] = [];
    for (const [id] of this.query(...types)) {
      ids.push(id);
    }
    return ids;
  }

  clear(): void {
    this.destroy(...this.#entities);
    this.#nextId = 1;
  }

  clearChanges(): void {
    for (const pool of this.#pools.values()) {
      pool.clearChanges();
    }
  }

  // Hook for subclasses that want to batch derived observers (e.g. reactive
  // signal bumps) around a sequence of writes. The base implementation is
  // a passthrough so callers can use it unconditionally.
  transaction<T>(fn: () => T): T {
    return fn();
  }

  #poolOf<T>(type: RiftType<T>): Pool<T> {
    let pool = this.#pools.get(type);
    if (!pool) {
      pool = new Pool(type);
      this.#pools.set(type, pool);
    }
    return pool as Pool<T>;
  }

  #emit(event: LocalWorldEvent): void {
    for (const h of this.#handlers) {
      h(event);
    }
  }
}

export class Pool<T> {
  readonly values = new Map<EntityId, T>();
  // For object-shaped components, the number is a bitmask of dirty field
  // indices. For other shapes it's WHOLE_DIRTY (the whole value is dirty).
  readonly dirty = new Map<EntityId, number>();
  readonly added = new Set<EntityId>();
  readonly removed = new Set<EntityId>();
  readonly #mergeOnWrite: boolean;
  readonly #fieldBit: ReadonlyMap<string, number> | undefined;

  constructor(type: RiftType<T>) {
    // Object-shaped components accept partial writes and are merged into
    // a fresh object so signal subscribers see a different reference.
    // Every other kind (primitives, arrays, tuples, unions, transforms)
    // is written whole, so the partial IS the replacement.
    this.#mergeOnWrite = type.kind === RiftTypeKind.Object;
    this.#fieldBit = isObjectType(type as RiftType)
      ? (type as unknown as ObjectType<Record<string, RiftType>>).fieldBit
      : undefined;
  }

  add(id: EntityId, v: T): void {
    this.values.set(id, v);
    if (!this.removed.delete(id)) {
      this.added.add(id);
    } else {
      // Add-after-remove inside one flush window: net effect for the
      // replication layer is a value mutation, not an add+remove pair.
      this.dirty.set(id, WHOLE_DIRTY);
    }
  }

  write(id: EntityId, partial: Partial<T>): WriteResult {
    if (!this.values.has(id)) {
      return "missing";
    }
    if (this.#mergeOnWrite) {
      const current = this.values.get(id) as T & object;
      // Skip the write entirely if every key in `partial` already equals
      // the current value.
      if (
        shallowEqualPartial(
          current as Readonly<Record<string, unknown>>,
          partial as Readonly<Record<string, unknown>>,
        )
      ) {
        return "unchanged";
      }
      this.values.set(id, { ...current, ...partial } as T);
      if (!this.added.has(id)) {
        this.dirty.set(
          id,
          mergeDirtyMask(
            this.dirty.get(id) ?? 0,
            current as Readonly<Record<string, unknown>>,
            partial as Readonly<Record<string, unknown>>,
            this.#fieldBit,
          ),
        );
      }
    } else {
      const current = this.values.get(id);
      if (Object.is(current, partial)) {
        return "unchanged";
      }
      this.values.set(id, partial as T);
      if (!this.added.has(id)) {
        this.dirty.set(id, WHOLE_DIRTY);
      }
    }
    return "changed";
  }

  remove(id: EntityId): boolean {
    if (!this.values.delete(id)) {
      return false;
    }
    if (this.added.delete(id)) {
      // Remove-after-add inside one flush window: replication never
      // saw this entity, so suppress both the add and the remove.
      this.dirty.delete(id);
      return true;
    }
    this.dirty.delete(id);
    this.removed.add(id);
    return true;
  }

  clearChanges(): void {
    this.dirty.clear();
    this.added.clear();
    this.removed.clear();
  }
}

function createQueryView<Types extends readonly RiftType[]>(
  world: World,
  includes: Types,
  excludes: readonly RiftType[],
): QueryView<Types> {
  const includeCount = includes.length;
  const excludeCount = excludes.length;

  function matches(id: EntityId): boolean {
    for (let i = 0; i < includeCount; i++) {
      if (!world.pool(includes[i]).values.has(id)) {
        return false;
      }
    }
    for (let i = 0; i < excludeCount; i++) {
      if (world.pool(excludes[i]).values.has(id)) {
        return false;
      }
    }
    return true;
  }

  function buildRow(id: EntityId): QueryRow<Types> {
    const row: unknown[] = [id];
    for (let i = 0; i < includeCount; i++) {
      row.push(world.pool(includes[i]).values.get(id));
    }
    return row as unknown as QueryRow<Types>;
  }

  function pickSeed(): Iterable<EntityId> {
    if (includeCount === 0) {
      return world.entities();
    }
    let smallest = world.pool(includes[0]);
    for (let i = 1; i < includeCount; i++) {
      const p = world.pool(includes[i]);
      if (p.values.size < smallest.values.size) {
        smallest = p;
      }
    }
    return smallest.values.keys();
  }

  return {
    *[Symbol.iterator](): IterableIterator<QueryRow<Types>> {
      for (const id of pickSeed()) {
        if (matches(id)) {
          yield buildRow(id);
        }
      }
    },
    get size() {
      if (includeCount === 1 && excludeCount === 0) {
        return world.pool(includes[0]).values.size;
      }
      let n = 0;
      for (const id of pickSeed()) {
        if (matches(id)) {
          n++;
        }
      }
      return n;
    },
    exclude(...newExcludes) {
      return createQueryView(world, includes, [...excludes, ...newExcludes]);
    },
  };
}

function shallowEqualPartial(
  current: Readonly<Record<string, unknown>>,
  partial: Readonly<Record<string, unknown>>,
): boolean {
  for (const key in partial) {
    if (!Object.is(current[key], partial[key])) {
      return false;
    }
  }
  return true;
}

function mergeDirtyMask(
  existing: number,
  current: Readonly<Record<string, unknown>>,
  partial: Readonly<Record<string, unknown>>,
  fieldBit: ReadonlyMap<string, number> | undefined,
): number {
  if (!fieldBit) {
    return WHOLE_DIRTY;
  }
  let mask = existing;
  for (const k in partial) {
    const bit = fieldBit.get(k);
    if (bit === undefined) {
      continue;
    }
    if (Object.is(current[k], partial[k])) {
      continue;
    }
    mask |= 1 << bit;
  }
  return mask;
}

// Sentinel mask for components that aren't object-shaped (and therefore
// don't have per-field bits). When dirty, the entire value is "dirty"; we
// represent that as all-bits-set so iteration code can just OR in.
export const WHOLE_DIRTY = 0xffff_ffff;

export interface QueryView<Types extends readonly RiftType[]> {
  [Symbol.iterator](): IterableIterator<QueryRow<Types>>;
  readonly size: number;
  exclude(...excludes: readonly RiftType[]): QueryView<Types>;
}

export type QueryRow<Types extends readonly RiftType[]> = readonly [
  EntityId,
  ...{ [K in keyof Types]: InferType<Types[K]> },
];

type InferType<R> = R extends RiftType<infer T> ? T : never;

export type LocalWorldEvent =
  | { readonly type: "entityCreated"; readonly id: EntityId }
  | { readonly type: "entityDestroyed"; readonly id: EntityId }
  | {
      readonly type: "componentAdded";
      readonly id: EntityId;
      readonly component: RiftType;
    }
  | {
      readonly type: "componentChanged";
      readonly id: EntityId;
      readonly component: RiftType;
    }
  | {
      readonly type: "componentRemoved";
      readonly id: EntityId;
      readonly component: RiftType;
    };

export type LocalWorldEventHandler = (event: LocalWorldEvent) => void;

export type WriteResult = "changed" | "unchanged" | "missing";
