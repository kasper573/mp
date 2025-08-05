import type { SyncInstanceFlush } from "./sync-entity";

export type AnyPatch = Patch<string, string | number, unknown>;

export type Patch<EntityName, EntityId, Entity> = Operation<
  EntityName,
  EntityId,
  Entity
>[];

export type Operation<EntityName, EntityId, Entity> =
  | MapUpsertOperation<EntityName, EntityId, Entity>
  | MapDeleteOperation<EntityName, EntityId>
  | EntityUpdateOperation<EntityName, EntityId>;

export interface MapUpsertOperation<EntityName, EntityId, Entity> {
  type: PatchOperationType.MapAdd;
  entityName: EntityName;
  added: readonly [EntityId, Entity][];
}

export interface MapDeleteOperation<EntityName, EntityId> {
  type: PatchOperationType.MapDelete;
  entityName: EntityName;
  removedIds: ReadonlySet<EntityId>;
}

export interface EntityUpdateOperation<EntityName, EntityId> {
  type: PatchOperationType.EntityUpdate;
  entityName: EntityName;
  changes: readonly [EntityId, SyncInstanceFlush][];
}

export enum PatchOperationType {
  MapAdd = 1,
  MapDelete = 2,
  EntityUpdate = 3,
}
