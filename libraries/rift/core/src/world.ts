import type { RiftType } from "@rift/types";
import type { EntityId } from "./protocol";
import type { RiftSchema } from "./schema";

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

export class Pool<T> {
  readonly values = new Map<EntityId, T>();
  readonly dirty = new Set<EntityId>();
  readonly added = new Set<EntityId>();
  readonly removed = new Set<EntityId>();

  add(id: EntityId, v: T): void {
    this.values.set(id, v);
    if (!this.removed.delete(id)) {
      this.added.add(id);
    } else {
      // Add-after-remove inside one flush window: net effect for the
      // replication layer is a value mutation, not an add+remove pair.
      this.dirty.add(id);
    }
  }

  write(id: EntityId, partial: Partial<T>): boolean {
    if (!this.values.has(id)) return false;
    const current = this.values.get(id) as T;
    if (typeof current === "object" && current !== null) {
      // In-place merge keeps the stored object's identity so consumers
      // holding references (e.g. cached query rows) see the update.
      Object.assign(current as object, partial);
    } else {
      this.values.set(id, partial as T);
    }
    if (!this.added.has(id)) this.dirty.add(id);
    return true;
  }

  remove(id: EntityId): boolean {
    if (!this.values.delete(id)) return false;
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

export interface QueryView<Types extends readonly RiftType[]> {
  [Symbol.iterator](): IterableIterator<QueryRow<Types>>;
  readonly size: number;
  toArray(): readonly QueryRow<Types>[];
  exclude(...excludes: readonly RiftType[]): QueryView<Types>;
}

export type QueryRow<Types extends readonly RiftType[]> = readonly [
  EntityId,
  ...{ [K in keyof Types]: InferType<Types[K]> },
];

type InferType<R> = R extends RiftType<infer T> ? T : never;

export class World {
  readonly schema: RiftSchema;
  readonly #entities = new Set<EntityId>();
  readonly #pools = new Map<RiftType, Pool<unknown>>();
  readonly #handlers = new Set<LocalWorldEventHandler>();
  #nextId = 1;

  constructor(schema: RiftSchema) {
    this.schema = schema;
    for (const type of schema.components) {
      this.#pools.set(type, new Pool());
    }
  }

  create(id?: EntityId): EntityId {
    if (id !== undefined) {
      if (!this.#entities.has(id)) {
        this.#entities.add(id);
        if (id >= this.#nextId) this.#nextId = id + 1;
        this.#emit({ type: "entityCreated", id });
      }
      return id;
    }
    const next = this.#nextId++ as EntityId;
    this.#entities.add(next);
    this.#emit({ type: "entityCreated", id: next });
    return next;
  }

  destroy(id: EntityId): void {
    if (!this.#entities.delete(id)) return;
    for (const [component, pool] of this.#pools) {
      if (pool.remove(id)) {
        this.#emit({ type: "componentRemoved", id, component });
      }
    }
    this.#emit({ type: "entityDestroyed", id });
  }

  exists(id: EntityId): boolean {
    return this.#entities.has(id);
  }

  has(id: EntityId, type: RiftType): boolean {
    return this.#poolOf(type).values.has(id);
  }

  get<T>(id: EntityId, type: RiftType<T>): T | undefined {
    return this.#poolOf(type).values.get(id) as T | undefined;
  }

  add<T>(id: EntityId, type: RiftType<T>, initial?: T): T {
    if (!this.#entities.has(id)) {
      throw new Error(`entity ${id} does not exist`);
    }
    const pool = this.#poolOf(type) as Pool<T>;
    if (pool.values.has(id)) {
      throw new Error(`entity ${id} already has component`);
    }
    const value = initial ?? type.default();
    pool.add(id, value);
    this.#emit({ type: "componentAdded", id, component: type });
    return value;
  }

  write<T>(id: EntityId, type: RiftType<T>, partial: Partial<T>): void {
    const pool = this.#poolOf(type) as Pool<T>;
    if (!pool.write(id, partial)) {
      throw new Error(`entity ${id} does not have component`);
    }
    this.#emit({ type: "componentChanged", id, component: type });
  }

  remove(id: EntityId, type: RiftType): void {
    if (this.#poolOf(type).remove(id)) {
      this.#emit({ type: "componentRemoved", id, component: type });
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
    return this.#poolOf(type) as Pool<T>;
  }

  pools(): ReadonlyMap<RiftType, Pool<unknown>> {
    return this.#pools;
  }

  entities(): ReadonlySet<EntityId> {
    return this.#entities;
  }

  clearChanges(): void {
    for (const pool of this.#pools.values()) {
      pool.clearChanges();
    }
  }

  #poolOf(type: RiftType): Pool<unknown> {
    let pool = this.#pools.get(type);
    if (!pool) {
      pool = new Pool();
      this.#pools.set(type, pool);
    }
    return pool;
  }

  #emit(event: LocalWorldEvent): void {
    for (const h of this.#handlers) h(event);
  }
}

function createQueryView<Types extends readonly RiftType[]>(
  world: World,
  includes: Types,
  excludes: readonly RiftType[],
): QueryView<Types> {
  const includeCount = includes.length;
  // Reused across iterations: iteration callers must consume values
  // within the loop body and never retain the row reference. `toArray()`
  // is the allocating-snapshot escape hatch.
  const row = new Array<unknown>(includeCount + 1);
  const excludeCount = excludes.length;

  function poolFor(type: RiftType): Pool<unknown> {
    return world.pool(type);
  }

  function matches(id: EntityId): boolean {
    for (let i = 0; i < includeCount; i++) {
      if (!poolFor(includes[i]).values.has(id)) return false;
    }
    for (let i = 0; i < excludeCount; i++) {
      if (poolFor(excludes[i]).values.has(id)) return false;
    }
    return true;
  }

  function fillRow(id: EntityId): QueryRow<Types> {
    row[0] = id;
    for (let i = 0; i < includeCount; i++) {
      row[i + 1] = poolFor(includes[i]).values.get(id);
    }
    return row as unknown as QueryRow<Types>;
  }

  function snapshotRow(id: EntityId): QueryRow<Types> {
    const out: unknown[] = [id];
    for (let i = 0; i < includeCount; i++) {
      out.push(poolFor(includes[i]).values.get(id));
    }
    return out as unknown as QueryRow<Types>;
  }

  function pickSeed(): Iterable<EntityId> {
    if (includeCount === 0) {
      return world.entities();
    }
    let smallest = poolFor(includes[0]);
    let smallestSize = smallest.values.size;
    for (let i = 1; i < includeCount; i++) {
      const p = poolFor(includes[i]);
      const n = p.values.size;
      if (n < smallestSize) {
        smallest = p;
        smallestSize = n;
      }
    }
    return smallest.values.keys();
  }

  return {
    [Symbol.iterator](): IterableIterator<QueryRow<Types>> {
      const seedIter = pickSeed()[Symbol.iterator]();
      const iter: IterableIterator<QueryRow<Types>> = {
        next(): IteratorResult<QueryRow<Types>> {
          while (true) {
            const r = seedIter.next();
            if (r.done) return { done: true, value: undefined };
            const id = r.value;
            if (matches(id)) {
              return { done: false, value: fillRow(id) };
            }
          }
        },
        [Symbol.iterator]() {
          return iter;
        },
      };
      return iter;
    },
    get size() {
      if (includeCount === 1 && excludeCount === 0) {
        return poolFor(includes[0]).values.size;
      }
      let n = 0;
      for (const id of pickSeed()) {
        if (matches(id)) n++;
      }
      return n;
    },
    toArray() {
      const out: QueryRow<Types>[] = [];
      for (const id of pickSeed()) {
        if (matches(id)) out.push(snapshotRow(id));
      }
      return out;
    },
    exclude(...newExcludes) {
      return createQueryView(world, includes, [...excludes, ...newExcludes]);
    },
  };
}
