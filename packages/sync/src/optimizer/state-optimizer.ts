import type { inferEntityValue, PatchableState } from "../sync-emitter";
import type {
  EntityOptimizer,
  EntityOptimizerRecord,
} from "./entity-optimizer";
import { EntityOptimizerBuilder } from "./entity-optimizer";
import { isPatchOptimizerEnabled } from "./settings";

export type StateOptimizer<State extends PatchableState> = {
  getEntityOptimizer<EntityName extends keyof State>(
    entityName: EntityName,
  ): EntityOptimizer<inferEntityValue<State[EntityName]>> | undefined;
  /**
   * Creates a new state with all entities transformed using their entity optimizers.
   */
  (state: State): State;
};

export class StateOptimizerBuilder<State extends PatchableState> {
  private entityOptimizers: EntityOptimizerRecord<State> = {};

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
    this.entityOptimizers[entityName] = builder.build();
    return this;
  }

  build(): StateOptimizer<State> {
    const { entityOptimizers } = this;

    function optimizeState(state: State): State {
      if (!isPatchOptimizerEnabled()) {
        return state;
      }
      const optimizedState = {} as State;
      for (const entityName in entityOptimizers) {
        const entities = state[entityName];
        const optimizeEntity = entityOptimizers[entityName];
        if (optimizeEntity) {
          const optimizedEntities = {} as State[typeof entityName];
          for (const entityId in entities) {
            const entity = entities[entityId];
            optimizedEntities[entityId] = optimizeEntity(
              entity as never,
            ) as never;
          }
          optimizedState[entityName] = optimizedEntities;
        } else {
          optimizedState[entityName] = entities;
        }
      }
      return optimizedState;
    }

    optimizeState.getEntityOptimizer = (entityName: keyof State) =>
      entityOptimizers[entityName];

    return optimizeState;
  }
}
