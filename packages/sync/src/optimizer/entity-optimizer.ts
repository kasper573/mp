import type { inferEntityValue, PatchableState } from "../sync-emitter";
import type {
  PropertyOptimizer,
  PropertyOptimizerRecord,
} from "./property-optimizer";
import { PropertyOptimizerBuilder } from "./property-optimizer";
import { isPatchOptimizerEnabled } from "./settings";

export type EntityOptimizer<Entity> = {
  getPropertyOptimizer<K extends keyof Entity>(
    key: K,
  ): PropertyOptimizer<Entity[K], Entity> | undefined;
  /**
   * Creates a new entity with all properties transformed using the transformer och each property optimizer
   */
  (entity: Entity): Entity;
};

export class EntityOptimizerBuilder<Entity> {
  private propertyOptimizers: PropertyOptimizerRecord<Entity> = {};

  property<PropertyName extends keyof Entity>(
    propertyName: PropertyName,
    configure: (
      builder: Omit<
        PropertyOptimizerBuilder<Entity[PropertyName], Entity>,
        "build"
      >,
    ) => void,
  ): this {
    const builder = new PropertyOptimizerBuilder<
      Entity[PropertyName],
      Entity
    >();
    configure(builder);
    this.propertyOptimizers[propertyName] = builder.build();
    return this;
  }

  build(): EntityOptimizer<Entity> {
    const { propertyOptimizers } = this;
    function optimizeEntity(entity: Entity): Entity {
      if (!isPatchOptimizerEnabled()) {
        return entity;
      }

      const optimizedEntity = {} as Entity;
      for (const key in entity) {
        const propertyOptimizer = propertyOptimizers[key];
        optimizedEntity[key] = propertyOptimizer
          ? propertyOptimizer.transform(entity[key])
          : entity[key];
      }

      return optimizedEntity;
    }

    optimizeEntity.getPropertyOptimizer = <K extends keyof Entity>(
      propertyName: K,
    ) => propertyOptimizers[propertyName];

    return optimizeEntity;
  }
}

export type EntityOptimizerRecord<State extends PatchableState> = {
  [EntityName in keyof State]?: EntityOptimizer<
    inferEntityValue<State[EntityName]>
  >;
};
