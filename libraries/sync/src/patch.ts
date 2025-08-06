import type { FlatTrackedValues } from "./tracked";

export type AnyEntityId = string | number;
export type AnyPatch = Patch<string, AnyEntityId, unknown>;
export type AnyOperation = Operation<string, AnyEntityId, unknown>;

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
  readonly type: PatchOperationType.MapAdd;
  readonly entityName: EntityName;
  readonly added: readonly [EntityId, Entity][];
}

export interface MapDeleteOperation<EntityName, EntityId> {
  readonly type: PatchOperationType.MapDelete;
  readonly entityName: EntityName;
  readonly removedIds: ReadonlySet<EntityId>;
}

export interface EntityUpdateOperation<EntityName, EntityId> {
  readonly type: PatchOperationType.EntityUpdate;
  readonly entityName: EntityName;
  readonly changes: readonly [EntityId, FlatTrackedValues][];
}

export enum PatchOperationType {
  MapAdd = 1,
  MapDelete = 2,
  EntityUpdate = 3,
}
