import type {
  EntityId,
  FlatEntityRecord,
  SyncEntityMapRecord,
} from "./create-entity-map";
import { createEntityMapRecord } from "./create-entity-map";
import type { ShapesFor } from "./shape";

export class SyncSystem<State> {
  readonly entities: SyncEntityMapRecord<State>;
  #entityIdsLastFlush = new Map<keyof State, ReadonlySet<EntityId>>();

  constructor(entityShapes: ShapesFor<State>) {
    this.entities = createEntityMapRecord<State>(entityShapes);
  }

  flush(): Patch {
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
          changes: map.selectFlat(addedIds),
        });

        // Ensure the added entities have their dirty state flushed
        // since we're producing an add patch which already contains all their data.
        for (const entityId of addedIds) {
          map.get(entityId)?.$flush();
        }
      }

      if (removedIds.size) {
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

      this.#entityIdsLastFlush.set(entityName, currentIds);
    }
    return patch;
  }

  update(patch: Patch) {
    for (const op of patch) {
      const map = this.entities[op.entityName as keyof State];
      if (op.removedIds) {
        for (const entityId of op.removedIds) {
          map.delete(entityId);
        }
      }
      if (op.changes) {
        for (const entityId in op.changes) {
          const existing = map.get(entityId);
          if (existing) {
            existing.$apply(op.changes[entityId]);
          } else {
            map.set(entityId, map.createFromFlat(op.changes[entityId]));
          }
        }
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
