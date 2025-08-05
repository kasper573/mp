import { SignalMap } from "@mp/state";
import type { FlatEntity, SyncEntity } from "./create-entity";
import { createEntity } from "./create-entity";
import type { Shape, ShapesFor } from "./shape";

export function createEntityMap<Entity>(shape: Shape): SyncEntityMap<Entity> {
  const entityMap = new SignalMap() as SyncEntityMap<Entity>;
  entityMap.create = (nested) => createEntity(shape, { nested });
  entityMap.createFromFlat = (flat) => createEntity(shape, { flat });
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
  shapes: ShapesFor<State>,
): SyncEntityMapRecord<State> {
  const record = {} as SyncEntityMapRecord<State>;
  for (const entityName in shapes) {
    record[entityName] = createEntityMap(shapes[entityName] as Shape);
  }
  return record;
}

export type SyncEntityMapRecord<State> = {
  [Entity in keyof State]: SyncEntityMap<State[Entity]>;
};

export type SyncEntityMap<Entity> = SignalMap<EntityId, SyncEntity<Entity>> & {
  create: (data: Entity) => SyncEntity<Entity>;
  createFromFlat: (flat: FlatEntity) => SyncEntity<Entity>;
  selectFlat(ids: Iterable<EntityId>): FlatEntityRecord;
};

export type FlatEntityRecord = Record<EntityId, FlatEntity>;

export type EntityId = string;
