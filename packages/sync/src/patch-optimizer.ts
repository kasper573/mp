import type { Patch, UpdateOperation } from "./patch";
import { PatchType } from "./patch";
import type { EventAccessFn, SyncEventMap } from "./sync-event";
import type { inferEntityValue, PatchableState } from "./sync-emitter";

/**
 * A patch optimizer is a set of rules that can be applied to a patch to
 * transform it into a more efficient form. It can be used to filter out
 * unnecessary operations or to transform operation values.
 */
export type PatchOptimizer<
  State extends PatchableState,
  EventMap extends SyncEventMap,
> = {
  [EntityName in keyof State]?: EntityPatchOptimizer<
    inferEntityValue<State[EntityName]>,
    EventMap
  >;
};

/**
 * An entity specific optimizer
 */
export type EntityPatchOptimizer<Entity, EventMap extends SyncEventMap> = {
  [Field in keyof Entity]?: PropertyPatchOptimizer<
    Entity[Field],
    Entity,
    EventMap
  >;
};

/**
 * A property specific optimizer
 */
export interface PropertyPatchOptimizer<
  Value,
  Entity,
  EventMap extends SyncEventMap,
> {
  filter?: PropertyPatchOptimizerFilter<Value, Entity, EventMap>;
  /**
   * Transforms the value of the property before applying the patch.
   */
  transform?: (value: Value) => Value;
}

/**
 * Determines whether the patch for a given property should be applied or not.
 */
export type PropertyPatchOptimizerFilter<
  Value,
  Entity,
  EventMap extends SyncEventMap,
> = (
  newValue: Value,
  oldValue: Value,
  entity: Entity,
  update: Partial<Entity>,
  getEvents: EventAccessFn<EventMap>,
) => boolean;

export class PatchOptimizerBuilder<
  State extends PatchableState,
  EventMap extends SyncEventMap,
> {
  private optimizer: PatchOptimizer<State, EventMap> = {};

  entity<EntityName extends keyof State>(
    entityName: EntityName,
    configure: (
      builder: Omit<
        EntityOptimizerBuilder<inferEntityValue<State[EntityName]>, EventMap>,
        "build"
      >,
    ) => void,
  ): this {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const builder = new EntityOptimizerBuilder<any, EventMap>();
    configure(builder);
    this.optimizer[entityName] = builder.build();
    return this;
  }

  build(): PatchOptimizer<State, EventMap> {
    return this.optimizer;
  }
}

export class EntityOptimizerBuilder<Entity, EventMap extends SyncEventMap> {
  private optimizer: EntityPatchOptimizer<Entity, EventMap> = {};

  property<K extends keyof Entity>(
    key: K,
    configure: (
      builder: Omit<
        PropertyOptimizerBuilder<Entity[K], Entity, EventMap>,
        "build"
      >,
    ) => void,
  ): this {
    const builder = new PropertyOptimizerBuilder<Entity[K], Entity, EventMap>();
    configure(builder);
    this.optimizer[key] = builder.build();
    return this;
  }

  build(): EntityPatchOptimizer<Entity, EventMap> {
    return this.optimizer;
  }
}

export class PropertyOptimizerBuilder<
  Value,
  Entity,
  EventMap extends SyncEventMap,
> {
  private optimizer: PropertyPatchOptimizer<Value, Entity, EventMap> = {};

  filter(filter: PropertyPatchOptimizerFilter<Value, Entity, EventMap>): this {
    this.optimizer.filter = filter;
    return this;
  }

  transform(transform: (value: Value) => Value): this {
    this.optimizer.transform = transform;
    return this;
  }

  build(): PropertyPatchOptimizer<Value, Entity, EventMap> {
    return this.optimizer;
  }
}

export function optimizeUpdate<Entity, EventMap extends SyncEventMap>(
  entityOptimizer: EntityPatchOptimizer<Entity, EventMap> | undefined,
  entity: Entity,
  updates: Partial<Entity>,
  getEvents: EventAccessFn<EventMap>,
): Partial<Entity> | undefined {
  const optimizedUpdates: Partial<Entity> = {};
  let hasUpdates = false;
  for (const key in updates) {
    const prop = key as keyof Entity;
    let newValue = updates[prop] as Entity[typeof prop];
    let oldValue = entity[prop];

    const optimizer = entityOptimizer?.[prop];
    if (optimizer?.transform) {
      newValue = optimizer.transform(newValue);
      oldValue = optimizer.transform(oldValue);
    }
    const filter = optimizer?.filter ?? refDiff;
    if (filter(newValue, oldValue, entity, updates, getEvents)) {
      hasUpdates = true;
      optimizedUpdates[prop] = newValue;
    }
  }
  if (hasUpdates) {
    return optimizedUpdates;
  }
}

const refDiff = <T>(a: T, b: T) => a !== b;

/**
 * Returns a new patch that transforms operations according to the provided optimizer.
 */
export function optimizePatch<
  State extends PatchableState,
  EventMap extends SyncEventMap,
>(
  state: State,
  patch: Patch,
  optimizer: PatchOptimizer<State, EventMap>,
  getEvents: EventAccessFn<EventMap>,
): Patch {
  return patch.map((op) =>
    op[0] === PatchType.Update
      ? optimizeUpdateOperation(state, optimizer, op, getEvents)
      : op,
  );
}

/**
 * Returns a new update operation with some properties filtered out.
 */
function optimizeUpdateOperation<
  State extends PatchableState,
  EventMap extends SyncEventMap,
>(
  state: State,
  patchOptimizer: PatchOptimizer<State, EventMap>,
  op: UpdateOperation,
  getEvents: EventAccessFn<EventMap>,
): UpdateOperation {
  const [, path, update] = op;

  if (path.length !== 2) {
    // We can only filter direct updates to entities.
    return op;
  }

  const entityName = path[0];
  const entityId = path[1];
  const entityOptimizer = patchOptimizer[entityName];
  if (!entityOptimizer) {
    // Entity has no filter, keep the operation as is.
    return op;
  }

  const entity = state[entityName][entityId as never];

  if (!entity) {
    // Entity doesn't exist in local state, which means the update is likely
    // intended to be applied to an entity that was received with the same patch.
    // In these cases, we don't want to filter out the update, since no local
    // state exists to compare against.
    return op;
  }

  const optimized = optimizeUpdate(
    entityOptimizer,
    entity as never,
    update as never,
    getEvents,
  );

  return [PatchType.Update, path, optimized];
}
