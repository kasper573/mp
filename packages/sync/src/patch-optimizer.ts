export type EntityPatchOptimizerRecord<State> = {
  [EntityName in keyof State]?: EntityPatchOptimizer<
    State[EntityName][keyof State[EntityName]]
  >;
};

export type EntityPatchOptimizer<Entity> = {
  [K in keyof Entity]?: PropertyPatchOptimizer<Entity, K>;
};

export interface PropertyPatchOptimizer<
  Entity,
  Key extends keyof Entity = keyof Entity,
> {
  filter?: PropertyPatchOptimizerFilter<Entity[Key]>;
  transform?: (value: Entity[Key]) => Entity[Key];
}

export type PropertyPatchOptimizerFilter<Value> = (
  newValue: Value,
  oldValue: Value,
) => boolean;

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
    if (filter(newValue, oldValue)) {
      hasUpdates = true;
      optimizedUpdates[prop] = newValue;
    }
  }
  if (hasUpdates) {
    return optimizedUpdates;
  }
}

const refDiff = <T>(a: T, b: T) => a !== b;
