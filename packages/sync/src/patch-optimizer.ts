import type { Patch, UpdateOperation } from "./patch";
import { PatchType } from "./patch";
import type { PatchableState } from "./sync-state-machine";

/**
 * A patch optimizer is a set of rules that can be applied to a patch to
 * transform it into a more efficient form. It can be used to filter out
 * unnecessary operations or to transform operation values.
 */
export type PatchOptimizer<State extends PatchableState> = {
  [EntityName in keyof State]?: EntityPatchOptimizer<
    State[EntityName][keyof State[EntityName]]
  >;
};

/**
 * An entity specific optimizer
 */
export type EntityPatchOptimizer<Entity> = {
  [Field in keyof Entity]?: PropertyPatchOptimizer<Entity[Field], Entity>;
};

/**
 * A property specific optimizer
 */
export interface PropertyPatchOptimizer<Value, Entity> {
  filter?: PropertyPatchOptimizerFilter<Value, Entity>;
  /**
   * Transforms the value of the property before applying the patch.
   */
  transform?: (value: Value) => Value;
}

/**
 * Determines whether the patch for a given property should be applied or not.
 */
export type PropertyPatchOptimizerFilter<Value, Entity> = (
  newValue: Value,
  oldValue: Value,
  entity: Entity,
  update: Partial<Entity>,
) => boolean;

export class PatchOptimizerBuilder<State extends PatchableState> {
  private optimizer: PatchOptimizer<State> = {};

  entity<EntityName extends keyof State>(
    entityName: EntityName,
    configure: (
      builder: Omit<
        EntityOptimizerBuilder<State[EntityName][keyof State[EntityName]]>,
        "build"
      >,
    ) => void,
  ): this {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const builder = new EntityOptimizerBuilder<any>();
    configure(builder);
    this.optimizer[entityName] = builder.build();
    return this;
  }

  build(): PatchOptimizer<State> {
    return this.optimizer;
  }
}

export class EntityOptimizerBuilder<Entity> {
  private optimizer: EntityPatchOptimizer<Entity> = {};

  property<K extends keyof Entity>(
    key: K,
    configure: (
      builder: Omit<PropertyOptimizerBuilder<Entity[K], Entity>, "build">,
    ) => void,
  ): this {
    const builder = new PropertyOptimizerBuilder<Entity[K], Entity>();
    configure(builder);
    this.optimizer[key] = builder.build();
    return this;
  }

  build(): EntityPatchOptimizer<Entity> {
    return this.optimizer;
  }
}

export class PropertyOptimizerBuilder<Value, Entity> {
  private optimizer: PropertyPatchOptimizer<Value, Entity> = {};

  filter(filter: PropertyPatchOptimizerFilter<Value, Entity>): this {
    this.optimizer.filter = filter;
    return this;
  }

  transform(transform: (value: Value) => Value): this {
    this.optimizer.transform = transform;
    return this;
  }

  build(): PropertyPatchOptimizer<Value, Entity> {
    return this.optimizer;
  }
}

export function optimizeUpdate<Entity>(
  entityOptimizer: EntityPatchOptimizer<Entity> | undefined,
  entity: Entity,
  updates: Partial<Entity>,
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
    if (filter(newValue, oldValue, entity, updates)) {
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
export function optimizePatch<State extends PatchableState>(
  state: State,
  patch: Patch,
  optimizer: PatchOptimizer<State>,
): Patch {
  return patch.map((op) =>
    op[0] === PatchType.Update
      ? optimizeUpdateOperation(state, optimizer, op)
      : op,
  );
}

/**
 * Returns a new update operation with some properties filtered out.
 */
function optimizeUpdateOperation<State extends PatchableState>(
  state: State,
  patchOptimizer: PatchOptimizer<State>,
  op: UpdateOperation,
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

  const entity = state[entityName][entityId];

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
  );

  return [PatchType.Update, path, optimized];
}
