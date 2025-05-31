import { isPatchOptimizerEnabled } from "./settings";

export interface PropertyOptimizer<Value, Entity> {
  filter: PropertyFilter<Value, Entity>;
  transform: (value: Value) => Value;
  (
    newValue: Value,
    oldValue: Value,
    entity: Entity,
  ): [accepted: boolean, transformedValue: Value];
}

export class PropertyOptimizerBuilder<Value, Entity> {
  #filter: PropertyFilter<Value, Entity> = refDiff;
  #transform: (value: Value) => Value = passThrough;

  filter(filter: PropertyFilter<Value, Entity>): this {
    this.#filter = filter;
    return this;
  }

  transform(transform: (value: Value) => Value): this {
    this.#transform = transform;
    return this;
  }

  build(): PropertyOptimizer<Value, Entity> {
    function propertyOptimizer(
      newValue: Value,
      prevValue: Value,
      entity: Entity,
    ): [accepted: boolean, transformedValue: Value] {
      if (!isPatchOptimizerEnabled()) {
        return [true, newValue];
      }

      prevValue = propertyOptimizer.transform(prevValue);
      newValue = propertyOptimizer.transform(newValue);
      const accepted = propertyOptimizer.filter(newValue, prevValue, entity);
      return [accepted, newValue];
    }

    propertyOptimizer.filter = this.#filter;
    propertyOptimizer.transform = this.#transform;

    return propertyOptimizer;
  }
}

export type PropertyOptimizerRecord<Entity> = {
  [Field in keyof Entity]?: PropertyOptimizer<Entity[Field], Entity>;
};

/**
 * Determines whether the new value should be applied or not
 */
export type PropertyFilter<Value, Entity> = (
  newValue: Value,
  oldValue: Value,
  entity: Entity,
) => boolean;

const passThrough = <T>(v: T): T => v;
const refDiff = <T>(a: T, b: T) => a !== b;
