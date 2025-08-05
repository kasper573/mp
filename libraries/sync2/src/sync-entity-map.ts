import { SignalMap } from "@mp/state";
import type { SyncSchema, SyncSchemaFor } from "./schema";
import type { FlatEntity, SyncEntity } from "./sync-entity";
import { createEntity } from "./sync-entity";

export function createEntityMap<Entity>(
  schema: SyncSchema,
): SyncEntityMap<Entity> {
  const entityMap = new SignalMap() as SyncEntityMap<Entity>;
  entityMap.create = (nested) => createEntity(schema, { nested });
  entityMap.createFromFlat = (flat) => createEntity(schema, { flat });
  entityMap.selectFlat = (ids) => {
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

export function createEntityMapRecord<State>(
  schema: SyncSchemaFor<State>,
): SyncEntities<State> {
  const record = {} as SyncEntities<State>;
  for (const entityName in schema) {
    record[entityName] = createEntityMap(schema[entityName] as SyncSchema);
  }
  return record;
}

export type SyncEntities<State> = {
  [EntityName in keyof State]: SyncEntityMap<State[EntityName]>;
};

export type SyncEntityMap<Entity> = SignalMap<EntityId, SyncEntity<Entity>> & {
  create: (data: Entity) => SyncEntity<Entity>;
  createFromFlat: (flat: FlatEntity) => SyncEntity<Entity>;
  selectFlat(ids: Iterable<EntityId>): FlatEntityRecord;
};

export type FlatEntityRecord = Record<EntityId, FlatEntity>;

export type EntityId = string;
