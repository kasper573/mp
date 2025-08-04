import type { ObjectSchema } from "@mp/encoding/schema";
import { SignalMap } from "@mp/state";
import type { FlatEntity, SyncEntity } from "./create-entity";
import { createEntity } from "./create-entity";
import { objectSchemaToTypeGraph } from "./type-graph";

export function createEntityMap<Entity>(
  schema: ObjectSchema<Entity>,
): SyncEntityMap<Entity> {
  const graph = objectSchemaToTypeGraph(schema);
  const entityMap = new SignalMap() as SyncEntityMap<Entity>;
  entityMap.create = (data) => createEntity(graph, data) as SyncEntity<Entity>;
  entityMap.selectFlatSlice = (ids) => {
    const slice: FlatEntityRecord = {};
    for (const entityId of ids) {
      const entity = entityMap.get(entityId);
      if (entity) {
        slice[entityId] = entity.$flat();
      }
    }
    return slice;
  };
  return entityMap;
}

export type SyncEntityMapRecord<State> = {
  [Entity in keyof State]: SyncEntityMap<State[Entity]>;
};

export type SyncEntityMap<Entity> = SignalMap<EntityId, SyncEntity<Entity>> & {
  create: (data: Entity) => SyncEntity<Entity>;
  selectFlatSlice(ids: Iterable<EntityId>): FlatEntityRecord;
};

export type FlatEntityRecord = Record<EntityId, FlatEntity>;

export type EntityId = string | number;
