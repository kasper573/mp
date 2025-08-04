export class SyncSystem {
  #entities = new Map<SyncEntityId, Set<SyncComponentId>>();
  #components = new Map<SyncComponentId, unknown>();
  #updatedComponents = new Set<SyncComponentId>();
  #updatedEntities = new Set<SyncEntityId>();
  #deletedEntities = new Set<SyncEntityId>();

  get entities(): ReadonlyMap<SyncEntityId, ReadonlySet<SyncComponentId>> {
    return this.#entities;
  }

  get components(): ReadonlyMap<SyncComponentId, unknown> {
    return this.#components;
  }

  set(entityId: SyncEntityId, componentId: SyncComponentId, value: unknown) {
    this.associate(entityId, componentId);
    this.#components.set(componentId, value);
    this.#updatedComponents.add(componentId);
    this.#deletedEntities.delete(entityId);
  }

  private associate(
    entityId: SyncEntityId,
    ...componentIds: SyncComponentId[]
  ) {
    let entity = this.#entities.get(entityId);
    if (!entity) {
      this.#entities.set(entityId, new Set(componentIds));
    } else {
      for (const componentId of componentIds) {
        entity.add(componentId);
      }
    }
    this.#updatedEntities.add(entityId);
  }

  delete(entityId: SyncEntityId) {
    const entityComponentIds = this.#entities.get(entityId);
    if (entityComponentIds) {
      for (const componentId of entityComponentIds) {
        this.#components.delete(componentId);
        this.#updatedComponents.delete(componentId);
      }
      this.#entities.delete(entityId);
      this.#updatedEntities.delete(entityId);
      this.#deletedEntities.add(entityId);
    }
  }

  flush(): SyncPatch {
    const patch: SyncPatch = [];
    if (this.#updatedComponents.size) {
      patch.push({
        op: SyncOpCode.UpdateComponents,
        components: selectMapSlice(this.#components, this.#updatedComponents),
      });
      this.#updatedComponents.clear();
    }
    if (this.#updatedEntities.size) {
      patch.push({
        op: SyncOpCode.UpdateEntities,
        entities: selectMapSlice(this.#entities, this.#updatedEntities),
      });
      this.#updatedEntities.clear();
    }
    if (this.#deletedEntities.size) {
      patch.push({
        op: SyncOpCode.DeleteEntities,
        entities: new Set(this.#deletedEntities),
      });
      this.#deletedEntities.clear();
    }
    return patch;
  }

  applyPatch(patch: SyncPatch) {
    for (const op of patch) {
      switch (op.op) {
        case SyncOpCode.UpdateComponents:
          for (const [componentId, value] of op.components) {
            this.#components.set(componentId, value);
          }
          break;
        case SyncOpCode.UpdateEntities:
          for (const [entityId, componentIds] of op.entities) {
            this.associate(entityId, ...componentIds);
          }
          break;
        case SyncOpCode.DeleteEntities:
          for (const entityId of op.entities) {
            this.delete(entityId);
          }
          break;
      }
    }
  }
}

function selectMapSlice<K, V>(map: Map<K, V>, keys: Iterable<K>): Map<K, V> {
  const result = new Map<K, V>();
  for (const key of keys) {
    if (map.has(key)) {
      result.set(key, map.get(key) as V);
    }
  }
  return result;
}

export enum SyncOpCode {
  UpdateComponents = 1,
  UpdateEntities = 2,
  DeleteEntities = 3,
}

export type SyncPatch = SyncOperation[];

export type SyncOperation =
  | UpdateComponentsOperation
  | UpdateEntitiesOperation
  | DeleteEntitiesOperation;

export interface UpdateComponentsOperation {
  op: SyncOpCode.UpdateComponents;
  components: Map<SyncComponentId, unknown>;
}

export interface UpdateEntitiesOperation {
  op: SyncOpCode.UpdateEntities;
  entities: Map<SyncEntityId, Set<SyncComponentId>>;
}

export interface DeleteEntitiesOperation {
  op: SyncOpCode.DeleteEntities;
  entities: Set<SyncEntityId>;
}

export type SyncComponentId = string | number;

export type SyncEntityId = string | number;
