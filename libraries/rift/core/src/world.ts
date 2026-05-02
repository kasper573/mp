import type { EntityId } from "./protocol";
import { internal } from "./internal";
import type { InferValue, RiftSignal, RiftType } from "@rift/types";
import type { RiftSchema } from "./schema";
import { ReactiveMap, ReactiveSet } from "./reactive";

export type QueryRow<Types extends readonly RiftType[]> = readonly [
  EntityId,
  ...{ [K in keyof Types]: InferValue<Types[K]> },
];

export interface QueryView<Types extends readonly RiftType[]> {
  [Symbol.iterator](): IterableIterator<QueryRow<Types>>;
  readonly size: number;
  toArray(): readonly QueryRow<Types>[];
  exclude(...excludes: readonly RiftType[]): QueryView<Types>;
}

export interface World {
  readonly schema: RiftSchema;
  readonly [internal]: WorldInternal;
  create(): EntityId;
  destroy(id: EntityId): void;
  exists(id: EntityId): boolean;
  add<T>(id: EntityId, type: RiftType<T>, initial?: T): T;
  set<T>(id: EntityId, type: RiftType<T>, value: T): T;
  remove(id: EntityId, type: RiftType): void;
  has(id: EntityId, type: RiftType): boolean;
  get<T>(id: EntityId, type: RiftType<T>): T | undefined;
  query<Types extends readonly RiftType[]>(...types: Types): QueryView<Types>;
  entities(): Iterable<EntityHandle>;
}

export interface ComponentSlot<V> {
  readonly signal: RiftSignal<V>;
  dirty: boolean;
}

export interface EntityHandle {
  readonly id: EntityId;
  readonly components: Map<RiftType, ComponentSlot<unknown>>;
}

export interface WorldInternal {
  readonly entities: ReactiveMap<EntityId, EntityHandle>;
  readonly componentIndex: Map<RiftType, ReactiveSet<EntityId>>;
  nextId: number;
  indexOf(type: RiftType): ReactiveSet<EntityId>;
  clearDirty(): void;
  ingestCreate(id: EntityId): void;
  ingestDestroy(id: EntityId): void;
  ingestAdd<T>(id: EntityId, type: RiftType<T>, value: T): void;
  ingestUpdate<T>(id: EntityId, type: RiftType<T>, value: T): void;
  ingestUpdateDirty(
    id: EntityId,
    type: RiftType,
    decodeDirty: (signal: RiftSignal<unknown>) => void,
  ): void;
  ingestRemove(id: EntityId, type: RiftType): void;
}

export function createWorld(schema: RiftSchema): World {
  const entities = new ReactiveMap<EntityId, EntityHandle>();
  const componentIndex = new Map<RiftType, ReactiveSet<EntityId>>();
  for (const type of schema.components) {
    componentIndex.set(type, new ReactiveSet());
  }

  function indexOf(type: RiftType): ReactiveSet<EntityId> {
    let set = componentIndex.get(type);
    if (!set) {
      set = new ReactiveSet();
      componentIndex.set(type, set);
    }
    return set;
  }

  function detachComponents(ent: EntityHandle): void {
    for (const ty of ent.components.keys()) {
      componentIndex.get(ty)?.delete(ent.id);
    }
  }

  const state: WorldInternal = {
    entities,
    componentIndex,
    nextId: 1,
    indexOf,
    clearDirty() {
      for (const ent of entities.values()) {
        for (const slot of ent.components.values()) {
          slot.dirty = false;
          slot.signal.clearDirty();
        }
      }
    },
    ingestCreate(id) {
      if (entities.has(id)) {
        return;
      }
      entities.set(id, { id, components: new Map() });
      if (id >= state.nextId) {
        state.nextId = id + 1;
      }
    },
    ingestDestroy(id) {
      const ent = entities.get(id);
      if (!ent) {
        return;
      }
      detachComponents(ent);
      entities.delete(id);
    },
    ingestAdd<T>(id: EntityId, type: RiftType<T>, value: T) {
      const ent = entities.get(id);
      if (!ent) {
        return;
      }
      const sig = type.signal(value);
      ent.components.set(
        type as RiftType,
        {
          signal: sig,
          dirty: false,
        } as ComponentSlot<unknown>,
      );
      indexOf(type as RiftType).add(id);
    },
    ingestUpdate<T>(id: EntityId, type: RiftType<T>, value: T) {
      const slot = entities.get(id)?.components.get(type as RiftType) as
        | ComponentSlot<T>
        | undefined;
      if (!slot) {
        state.ingestAdd(id, type, value);
        return;
      }
      slot.signal.set(value);
      slot.signal.clearDirty();
      slot.dirty = false;
    },
    ingestUpdateDirty(
      id: EntityId,
      type: RiftType,
      decodeDirty: (signal: RiftSignal<unknown>) => void,
    ) {
      const slot = entities.get(id)?.components.get(type);
      if (!slot) {
        return;
      }
      decodeDirty(slot.signal);
      slot.signal.clearDirty();
      slot.dirty = false;
    },
    ingestRemove(id, type) {
      const ent = entities.get(id);
      if (!ent) {
        return;
      }
      if (ent.components.delete(type)) {
        componentIndex.get(type)?.delete(id);
      }
    },
  };

  const world: World = {
    schema,
    [internal]: state,
    create(): EntityId {
      const id = state.nextId++ as EntityId;
      entities.set(id, { id, components: new Map() });
      return id;
    },
    destroy(id) {
      const ent = entities.get(id);
      if (!ent) {
        return;
      }
      detachComponents(ent);
      entities.delete(id);
    },
    exists(id) {
      return entities.has(id);
    },
    add<T>(id: EntityId, type: RiftType<T>, initial?: T): T {
      const ent = entities.get(id);
      if (!ent) {
        throw new Error(`entity ${id} does not exist`);
      }
      if (ent.components.has(type as RiftType)) {
        throw new Error(`entity ${id} already has component`);
      }
      const value = initial ?? type.default();
      const sig = type.signal(value);
      const slot: ComponentSlot<T> = { signal: sig, dirty: true };
      sig.setRoot(slot);
      ent.components.set(type as RiftType, slot as ComponentSlot<unknown>);
      indexOf(type as RiftType).add(id);
      return sig.value;
    },
    set<T>(id: EntityId, type: RiftType<T>, value: T): T {
      const slot = entities.get(id)?.components.get(type as RiftType) as
        | ComponentSlot<T>
        | undefined;
      if (!slot) {
        throw new Error(`entity ${id} does not have component`);
      }
      slot.signal.set(value);
      return slot.signal.value;
    },
    remove(id, type) {
      const ent = entities.get(id);
      if (!ent) {
        return;
      }
      if (ent.components.delete(type)) {
        componentIndex.get(type)?.delete(id);
      }
    },
    has(id, type) {
      return indexOf(type).has(id);
    },
    get<T>(id: EntityId, type: RiftType<T>): T | undefined {
      const ent = entities.peekGet(id);
      if (!ent) return undefined;
      const slot = ent.components.get(type as RiftType);
      return slot?.signal.value as T | undefined;
    },
    query(...types) {
      return createQueryView(world, types, []);
    },
    entities() {
      return entities.values();
    },
  };

  return world;
}

function createQueryView<Types extends readonly RiftType[]>(
  world: World,
  includes: Types,
  excludes: readonly RiftType[],
): QueryView<Types> {
  const state = world[internal];
  const includeCount = includes.length;
  const excludeCount = excludes.length;
  // Reused across iterations to avoid per-row allocation; callers are
  // expected to consume row values within the for..of body and not retain
  // references to the array across iterations.
  const row = new Array<unknown>(includeCount + 1);

  function matches(ent: EntityHandle): boolean {
    const comps = ent.components;
    for (let i = 0; i < includeCount; i++) {
      if (!comps.has(includes[i])) return false;
    }
    for (let i = 0; i < excludeCount; i++) {
      if (comps.has(excludes[i])) return false;
    }
    return true;
  }

  function fillRow(ent: EntityHandle): QueryRow<Types> {
    row[0] = ent.id;
    const comps = ent.components;
    for (let i = 0; i < includeCount; i++) {
      row[i + 1] = comps.get(includes[i])?.signal.value;
    }
    return row as unknown as QueryRow<Types>;
  }

  function pickSeed(): ReactiveSet<EntityId> | "all" {
    if (includeCount === 0) return "all";
    let smallest = state.indexOf(includes[0]);
    let smallestSize = smallest.size;
    for (let i = 1; i < includeCount; i++) {
      const s = state.indexOf(includes[i]);
      const n = s.size;
      if (n < smallestSize) {
        smallest = s;
        smallestSize = n;
      }
    }
    for (let i = 0; i < excludeCount; i++) {
      void state.indexOf(excludes[i]).size;
    }
    return smallest;
  }

  return {
    [Symbol.iterator](): IterableIterator<QueryRow<Types>> {
      const seed = pickSeed();
      const all = seed === "all";
      const entities = state.entities;
      const seedIter: Iterator<EntityHandle | EntityId> = all
        ? entities.values()
        : seed[Symbol.iterator]();
      const iter: IterableIterator<QueryRow<Types>> = {
        next(): IteratorResult<QueryRow<Types>> {
          while (true) {
            const r = seedIter.next();
            if (r.done) return { done: true, value: undefined };
            const ent = all
              ? (r.value as EntityHandle)
              : entities.peekGet(r.value as EntityId);
            if (ent && matches(ent)) {
              return { done: false, value: fillRow(ent) };
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
        return state.indexOf(includes[0]).size;
      }
      let n = 0;
      const seed = pickSeed();
      if (seed === "all") {
        for (const ent of state.entities.values()) {
          if (matches(ent)) n++;
        }
      } else {
        const entities = state.entities;
        for (const id of seed) {
          const ent = entities.peekGet(id);
          if (ent && matches(ent)) n++;
        }
      }
      return n;
    },
    toArray() {
      const out: QueryRow<Types>[] = [];
      const seed = pickSeed();
      if (seed === "all") {
        for (const ent of state.entities.values()) {
          if (matches(ent)) out.push(snapshotRow(ent, includes));
        }
      } else {
        const entities = state.entities;
        for (const id of seed) {
          const ent = entities.peekGet(id);
          if (ent && matches(ent)) out.push(snapshotRow(ent, includes));
        }
      }
      return out;
    },
    exclude(...newExcludes) {
      return createQueryView(world, includes, [...excludes, ...newExcludes]);
    },
  };
}

function snapshotRow<Types extends readonly RiftType[]>(
  ent: EntityHandle,
  includes: Types,
): QueryRow<Types> {
  const out: unknown[] = [ent.id];
  for (let i = 0; i < includes.length; i++) {
    out.push(ent.components.get(includes[i])?.signal.value);
  }
  return out as unknown as QueryRow<Types>;
}
