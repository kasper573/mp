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

export function optimizePatchOperationValue<Entity, Key extends keyof Entity>(
  {
    transform,
    filter = defaultOptimizerFilter,
  }: PropertyPatchOptimizer<Entity, Key> | undefined = empty,
  newValue: Entity[Key],
  oldValue: Entity[Key],
): { value: Entity[Key] } | undefined {
  if (transform) {
    newValue = transform(newValue);
    oldValue = transform(oldValue);
  }
  if (!filter(newValue, oldValue)) {
    return;
  }
  return { value: newValue };
}

const empty = Object.freeze({});

const defaultOptimizerFilter: PropertyPatchOptimizerFilter<unknown> = (
  newValue,
  oldValue,
) => newValue !== oldValue;
