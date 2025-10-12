import type { DeepPartial } from "./tracked";

export type AnyEntityId = string | number;
export type AnyPatch = Patch<string, AnyEntityId, unknown>;
export type AnyOperation = Operation<string, AnyEntityId, unknown>;

export type Patch<EntityName, EntityId, Entity> = Operation<
  EntityName,
  EntityId,
  Entity
>[];

export type Operation<EntityName, EntityId, Entity> =
  | MapAddOperation<EntityName, EntityId, Entity>
  | MapReplaceOperation<EntityName, EntityId, Entity>
  | MapDeleteOperation<EntityName, EntityId>
  | EntityUpdateOperation<EntityName, EntityId, Entity>;

export interface MapAddOperation<EntityName, EntityId, Entity> {
  readonly type: PatchOperationType.MapAdd;
  readonly entityName: EntityName;
  readonly added: readonly [EntityId, Entity][];
}

export interface MapReplaceOperation<EntityName, EntityId, Entity> {
  readonly type: PatchOperationType.MapReplace;
  readonly entityName: EntityName;
  readonly replacement: readonly [EntityId, Entity][];
}

export interface MapDeleteOperation<EntityName, EntityId> {
  readonly type: PatchOperationType.MapDelete;
  readonly entityName: EntityName;
  readonly removedIds: ReadonlySet<EntityId>;
}

export interface EntityUpdateOperation<EntityName, EntityId, Entity> {
  readonly type: PatchOperationType.EntityUpdate;
  readonly entityName: EntityName;
  readonly changes: readonly [EntityId, DeepPartial<Entity>][];
}

export enum PatchOperationType {
  MapAdd = 1,
  MapReplace = 2,
  MapDelete = 3,
  EntityUpdate = 4,
}
