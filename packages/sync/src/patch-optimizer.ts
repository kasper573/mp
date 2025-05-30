import type { inferEntityValue, PatchableState } from "./sync-emitter";

/**
 * A patch optimizer is a set of rules that can be applied to a patch to
 * transform it into a more efficient form. It can be used to filter out
 * unnecessary operations or to transform operation values.
 */
export type PatchOptimizer<State extends PatchableState> = {
  [EntityName in keyof State]?: EntityPatchOptimizer<
    inferEntityValue<State[EntityName]>
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
) => boolean;

export class PatchOptimizerBuilder<State extends PatchableState> {
  private optimizer: PatchOptimizer<State> = {};

  entity<EntityName extends keyof State>(
    entityName: EntityName,
    configure: (
      builder: Omit<
        EntityOptimizerBuilder<inferEntityValue<State[EntityName]>>,
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
