import { NotifiableSignal } from "@mp/state";
import { assert } from "@mp/std";
import { PatchOperationType, type Operation, type Patch } from "./patch";
import type { TrackedInstanceFlush } from "./tracked";
import { flushTrackedInstance, updateTrackedInstance } from "./tracked";

export class SyncMap<EntityId, Entity> {
  #signal: NotifiableSignal<Map<EntityId, Entity>>;
  #keysLastFlush = new Set<EntityId>();

  constructor(entries?: Iterable<readonly [EntityId, Entity]> | null) {
    this.#signal = new NotifiableSignal(new Map(entries));
  }

  clear(): void {
    const map = this.#signal.value;
    if (map.size > 0) {
      map.clear();
      this.#signal.notify();
    }
  }
  delete(key: EntityId): boolean {
    const deleted = this.#signal.value.delete(key);
    if (deleted) {
      this.#signal.notify();
    }
    return deleted;
  }
  get(key: EntityId): Entity | undefined {
    return this.#signal.value.get(key);
  }
  has(key: EntityId): boolean {
    return this.#signal.value.has(key);
  }
  set(key: EntityId, value: Entity): this {
    this.#signal.value.set(key, value);
    this.#signal.notify();
    return this;
  }
  get size(): number {
    return this.#signal.value.size;
  }
  entries(): MapIterator<[EntityId, Entity]> {
    return this.#signal.value.entries();
  }
  keys(): MapIterator<EntityId> {
    return this.#signal.value.keys();
  }
  values(): MapIterator<Entity> {
    return this.#signal.value.values();
  }
  [Symbol.iterator](): MapIterator<[EntityId, Entity]> {
    return this.#signal.value[Symbol.iterator]();
  }
  get [Symbol.toStringTag](): string {
    return this.#signal.value[Symbol.toStringTag];
  }

  *sliceMap<T>(
    keys: Iterable<EntityId>,
    map: (v: Entity) => T,
  ): MapIterator<[EntityId, T]> {
    for (const key of keys) {
      const entity = this.get(key);
      if (entity) {
        yield [key, map(entity)];
      }
    }
  }

  flush<EntityName>(
    entityName: EntityName,
    patch: Patch<EntityName, EntityId, Entity>,
  ) {
    const currentIds = new Set(this.keys());
    const addedIds = currentIds.difference(this.#keysLastFlush);
    const removedIds = this.#keysLastFlush.difference(currentIds);
    const staleIds = currentIds.intersection(this.#keysLastFlush);

    if (addedIds.size) {
      patch.push({
        type: PatchOperationType.MapAdd,
        entityName,
        added: this.sliceMap(addedIds, (v) => v).toArray(),
      });

      // Ensure the added entities have their dirty state flushed and omitted
      // since we're producing an add patch which already contains all their data.
      for (const entityId of addedIds) {
        flushTrackedInstance(this.get(entityId) as Entity);
      }
    }

    if (removedIds.size) {
      patch.push({
        type: PatchOperationType.MapDelete,
        entityName,
        removedIds,
      });
    }

    const instanceFlushes: Array<[EntityId, TrackedInstanceFlush]> = [];
    for (const entityId of staleIds) {
      const changes = flushTrackedInstance(this.get(entityId) as Entity);
      if (changes) {
        instanceFlushes.push([entityId, changes]);
      }
    }

    if (instanceFlushes.length) {
      patch.push({
        type: PatchOperationType.EntityUpdate,
        entityName,
        changes: instanceFlushes,
      });
    }

    this.#keysLastFlush = currentIds;
  }

  applyOperation<EntityName>(
    op: Operation<EntityName, EntityId, Entity>,
  ): void {
    switch (op.type) {
      case PatchOperationType.MapAdd:
        for (const [entityId, entity] of op.added) {
          this.set(entityId, entity);
        }
        break;
      case PatchOperationType.MapDelete:
        for (const entityId of op.removedIds) {
          this.delete(entityId);
        }
        break;
      case PatchOperationType.EntityUpdate:
        for (const [entityId, changes] of op.changes) {
          const entity = assert(
            this.get(entityId),
            `Entity not found for update: ${entityId}`,
          );
          updateTrackedInstance(entity, changes);
        }
        break;
    }
  }
}
