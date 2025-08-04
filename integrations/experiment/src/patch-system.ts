import type {
  EntityId,
  FlatEntityRecord,
  SyncEntityMapRecord,
} from "./create-entity-map";

export class PatchSystem<State> {
  #entityIdsLastFlush = new Map<keyof State, ReadonlySet<EntityId>>();

  constructor(private entities: SyncEntityMapRecord<State>) {}

  createPatch(): Patch {
    const patch: Patch = [];

    for (const entityName in this.entities) {
      const map = this.entities[entityName];
      const lastIds = this.#entityIdsLastFlush.get(entityName) ?? noIds;
      const currentIds = new Set(map.keys());

      const addedIds = currentIds.difference(lastIds);
      const removedIds = lastIds.difference(currentIds);
      const staleIds = currentIds.intersection(lastIds);

      if (addedIds.size > 0) {
        patch.push({
          entityName,
          changes: map.selectFlatSlice(addedIds),
        });
      }

      if (removedIds.size > 0) {
        patch.push({
          entityName,
          removedIds,
        });
      }

      let changesPerEntity: FlatEntityRecord | undefined;
      for (const entityId of staleIds) {
        const changes = map.get(entityId)?.$flush();
        if (changes) {
          changesPerEntity ??= {};
          changesPerEntity[entityId] = changes;
        }
      }

      if (changesPerEntity) {
        patch.push({
          entityName,
          changes: changesPerEntity,
        });
      }

      this.#entityIdsLastFlush.set(entityName, staleIds);
    }
    return patch;
  }

  applyPatch(patch: Patch) {
    for (const op of patch) {
      this.applyOperation(op);
    }
  }

  applyOperation(op: Operation) {
    const map = this.entities[op.entityName as keyof State];
    if (op.removedIds) {
      for (const entityId of op.removedIds) {
        map.delete(entityId);
      }
    }
    if (op.changes) {
      for (const entityId in op.changes) {
        map.get(entityId)?.$apply(op.changes[entityId]);
      }
    }
  }
}

export type Patch = Operation[];

export interface Operation {
  entityName: string;
  changes?: FlatEntityRecord;
  removedIds?: Set<EntityId>;
}

const noIds = Object.freeze(new Set<EntityId>());
