import { EventBus } from "@rift/event";
import type { EntityId } from "./protocol";
import { RiftTypeKind, type RiftType } from "@rift/types";
import type { RiftSchema } from "./schema";

/**
 * Marker `RiftType` used as an event-bus key for purely local world
 * events. Calling encode/decode on these throws by design — they are
 * never replicated and registering them in a wire schema is a bug.
 */
function localWorldEvent<T>(): RiftType<T> {
  return {
    kind: RiftTypeKind.Object,
    inspect: () => new Uint8Array(0),
    default: () => ({}) as T,
    encode: () => {
      throw new Error("world event is local-only and cannot be encoded");
    },
    decode: () => {
      throw new Error("world event is local-only and cannot be decoded");
    },
  };
}

export const EntityCreated = localWorldEvent<{ id: EntityId }>();
export const EntityDestroyed = localWorldEvent<{ id: EntityId }>();
export const ComponentAdded = localWorldEvent<{
  id: EntityId;
  type: RiftType;
}>();
export const ComponentChanged = localWorldEvent<{
  id: EntityId;
  type: RiftType;
}>();
export const ComponentRemoved = localWorldEvent<{
  id: EntityId;
  type: RiftType;
}>();

/**
 * Per-component pool. `values` holds the current state for every entity
 * that has the component; `dirty`/`added`/`removed` accumulate changes
 * since the last `clearChanges()` for the replication layer to consume.
 */
export class Pool<T> {
  readonly values = new Map<EntityId, T>();
  readonly dirty = new Set<EntityId>();
  readonly added = new Set<EntityId>();
  readonly removed = new Set<EntityId>();

  has(id: EntityId): boolean {
    return this.values.has(id);
  }

  get(id: EntityId): T | undefined {
    return this.values.get(id);
  }

  add(id: EntityId, v: T): void {
    this.values.set(id, v);
    if (!this.removed.delete(id)) {
      this.added.add(id);
    } else {
      // Add-after-remove within a single flush window: net effect is
      // "value mutated", not "added then removed".
      this.dirty.add(id);
    }
  }

  write(id: EntityId, partial: Partial<T>): boolean {
    if (!this.values.has(id)) return false;
    const current = this.values.get(id) as T;
    if (typeof current === "object" && current !== null) {
      // Object-valued component: shallow merge in place (preserves identity
      // so consumers holding references see the update).
      Object.assign(current as object, partial);
    } else {
      // Primitive-valued component (rare but supported): replace.
      this.values.set(id, partial as T);
    }
    if (!this.added.has(id)) this.dirty.add(id);
    return true;
  }

  remove(id: EntityId): boolean {
    if (!this.values.delete(id)) return false;
    if (this.added.delete(id)) {
      // Remove-after-add within a single flush window: net effect is
      // "never existed for this client".
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
  readonly #bus = new EventBus<undefined, undefined>();
  #nextId = 1;

  constructor(schema: RiftSchema) {
    this.schema = schema;
    for (const type of schema.components) {
      this.#pools.set(type, new Pool());
    }
  }

  /**
   * Auto-assigns a fresh entity id (server-side use), or records an
   * explicit id (client-side delta-ingestion use, where the server has
   * already assigned the id). Returns the id.
   */
  create(id?: EntityId): EntityId {
    if (id !== undefined) {
      if (!this.#entities.has(id)) {
        this.#entities.add(id);
        if (id >= this.#nextId) this.#nextId = id + 1;
        this.#emit(EntityCreated, { id });
      }
      return id;
    }
    const next = this.#nextId++ as EntityId;
    this.#entities.add(next);
    this.#emit(EntityCreated, { id: next });
    return next;
  }

  destroy(id: EntityId): void {
    if (!this.#entities.delete(id)) return;
    for (const [type, pool] of this.#pools) {
      if (pool.remove(id)) {
        this.#emit(ComponentRemoved, { id, type });
      }
    }
    this.#emit(EntityDestroyed, { id });
  }

  exists(id: EntityId): boolean {
    return this.#entities.has(id);
  }

  has(id: EntityId, type: RiftType): boolean {
    return this.#poolOf(type).has(id);
  }

  get<T>(id: EntityId, type: RiftType<T>): T | undefined {
    return this.#poolOf(type).get(id) as T | undefined;
  }

  add<T>(id: EntityId, type: RiftType<T>, initial?: T): T {
    if (!this.#entities.has(id)) {
      throw new Error(`entity ${id} does not exist`);
    }
    const pool = this.#poolOf(type) as Pool<T>;
    if (pool.has(id)) {
      throw new Error(`entity ${id} already has component`);
    }
    const value = initial ?? type.default();
    pool.add(id, value);
    this.#emit(ComponentAdded, { id, type: type as RiftType });
    return value;
  }

  write<T>(id: EntityId, type: RiftType<T>, partial: Partial<T>): void {
    const pool = this.#poolOf(type) as Pool<T>;
    if (!pool.write(id, partial)) {
      throw new Error(`entity ${id} does not have component`);
    }
    this.#emit(ComponentChanged, { id, type: type as RiftType });
  }

  remove(id: EntityId, type: RiftType): void {
    if (this.#poolOf(type).remove(id)) {
      this.#emit(ComponentRemoved, { id, type });
    }
  }

  query<const Types extends readonly RiftType[]>(
    ...types: Types
  ): QueryView<Types> {
    return createQueryView(this, types, []);
  }

  /**
   * Subscribe to a world event. The callback receives the event data
   * directly (no source/target wrapper). Returns an unsubscribe function.
   */
  on<Data>(type: RiftType<Data>, handler: (data: Data) => void): () => void {
    return this.#bus.on(type, (event) => {
      handler(event.data);
    });
  }

  // Same-package surface used by replication and the reactive layer.

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

  #emit<Data>(type: RiftType<Data>, data: Data): void {
    this.#bus.emit({ type, data, source: undefined, target: undefined });
  }
}

export function createWorld(schema: RiftSchema): World {
  return new World(schema);
}

function createQueryView<Types extends readonly RiftType[]>(
  world: World,
  includes: Types,
  excludes: readonly RiftType[],
): QueryView<Types> {
  const includeCount = includes.length;
  const excludeCount = excludes.length;
  // Reused across iterations to avoid per-row allocation. Callers must
  // consume row values within the loop body and not retain references
  // to the row across iterations. `toArray()` does the safe copy.
  const row = new Array<unknown>(includeCount + 1);

  function poolFor(type: RiftType): Pool<unknown> {
    return world.pool(type);
  }

  function matches(id: EntityId): boolean {
    for (let i = 0; i < includeCount; i++) {
      if (!poolFor(includes[i]).has(id)) return false;
    }
    for (let i = 0; i < excludeCount; i++) {
      if (poolFor(excludes[i]).has(id)) return false;
    }
    return true;
  }

  function fillRow(id: EntityId): QueryRow<Types> {
    row[0] = id;
    for (let i = 0; i < includeCount; i++) {
      row[i + 1] = poolFor(includes[i]).get(id);
    }
    return row as unknown as QueryRow<Types>;
  }

  function snapshotRow(id: EntityId): QueryRow<Types> {
    const out: unknown[] = [id];
    for (let i = 0; i < includeCount; i++) {
      out.push(poolFor(includes[i]).get(id));
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
