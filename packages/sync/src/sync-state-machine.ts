import type { ReadonlyDeep } from "type-fest";
import { PatchType, type Patch, type PatchPath } from "./patch";
import type { PatchOptimizer } from "./patch-optimizer";
import { optimizeUpdate } from "./patch-optimizer";
import type { EventAccessFn } from "./sync-event";
import { type SyncEventMap } from "./sync-event";
import type {
  ClientId,
  ClientVisibilityFactory,
  FlushResult,
  PatchableEntities,
  PatchableState,
} from "./sync-emitter";
import { SyncEmitter } from "./sync-emitter";

/**
 * A state machine that records all state changes made as atomic patches,
 * is aware of which patches should be visible per client,
 * and allows flushing the collected patches at any given time.
 */
export type SyncStateMachine<
  State extends PatchableState,
  EventMap extends SyncEventMap,
> = EntityRepositoryRecord<State> & {
  [flushFunctionName]: FlushFn;
  [eventFunctionName]: EventFn<EventMap, State>;
};

export function createSyncStateMachine<
  State extends PatchableState,
  EventMap extends SyncEventMap,
>(
  opt: SyncStateMachineOptions<State, EventMap>,
): SyncStateMachine<State, EventMap> {
  const state = structuredClone(opt.initialState);

  const emitter = new SyncEmitter<State, EventMap>(opt);

  const eventFn = ((...args) => emitter.addEvent(...args)) as EventFn<
    EventMap,
    State
  >;
  eventFn.peek = (...args) => emitter.peekEvent(...args);

  const flushFn = (() => emitter.flush(state)) as FlushFn;
  flushFn.markToResendFullState = (...args) =>
    emitter.markToResendFullState(...args);

  const repositories = {} as Partial<EntityRepositoryRecord<State>>;
  return new Proxy({} as SyncStateMachine<State, EventMap>, {
    get(target, prop) {
      switch (prop) {
        case flushFunctionName:
          return flushFn;
        case eventFunctionName:
          return eventFn;
      }
      const entityName = prop as keyof State;
      return (repositories[entityName] ??= createEntityRepository(
        state,
        emitter.patch,
        entityName,
        eventFn,
        opt.patchOptimizer,
      ));
    },
  });
}

function createEntityRepository<
  State extends PatchableState,
  EntityName extends keyof State,
  EventMap extends SyncEventMap,
>(
  state: State,
  serverPatch: Patch,
  entityName: EntityName,
  eventFn: EventFn<EventMap, State>,
  patchOptimier?: () => PatchOptimizer<State, EventMap> | undefined,
): EntityRepository<State[EntityName]> {
  type Entities = State[EntityName];
  type Id = keyof Entities;
  type Entity = Entities[Id];

  function entity() {
    // Type level immutability is enough, we don't need to check at runtime as it will impact performance
    return state[entityName] as ReadonlyDeep<Entities>;
  }

  entity.set = function setEntity(id: Id, entity: Entity) {
    serverPatch.push([PatchType.Set, [entityName, id] as PatchPath, entity]);
    state[entityName][id] = entity;
  };

  const update: EntityRepository<State[EntityName]>["update"] = (
    id,
    addUpdates,
  ) => {
    const updateBuilder = new EntityUpdateBuilder<Entity>();
    addUpdates(updateBuilder);
    const updates = updateBuilder.build();

    const entity = state[entityName][id];
    const optimizedUpdates = optimizeUpdate(
      patchOptimier?.()?.[entityName],
      entity,
      updates,
      eventFn.peek,
    );

    Object.assign(entity as object, updates);

    if (optimizedUpdates) {
      serverPatch.push([
        PatchType.Update,
        [entityName, id] as PatchPath,
        optimizedUpdates,
      ]);
    }
  };

  entity.update = update;

  entity.remove = function removeEntity(id: Id) {
    serverPatch.push([PatchType.Remove, [entityName, id] as PatchPath]);
    delete state[entityName][id];
  };

  entity.values = function* () {
    const entities = state[entityName];
    for (const entityId in entities) {
      yield entities[entityId] as ReadonlyDeep<Entity>;
    }
  };

  entity.keys = function* () {
    const entities = state[entityName];
    for (const entityId in entities) {
      yield entityId;
    }
  };

  return entity;
}

// $ to avoid collision with user defined properties
const eventFunctionName = "$event";
const flushFunctionName = "$flush";

export type EntityRepositoryRecord<State extends PatchableState> = {
  [EntityName in keyof State]: EntityRepository<State[EntityName]>;
};

interface FlushFn {
  (): FlushResult;
  markToResendFullState(...clientIds: ClientId[]): void;
}

interface EventFn<EventMap extends SyncEventMap, State extends PatchableState> {
  /**
   * Adds an event to the current sync message that is being built and will be sent to clients on the next flush.
   */
  <EventName extends keyof EventMap>(
    name: EventName,
    payload: EventMap[EventName],
    visibility?: {
      [EntityName in keyof State]: Iterable<keyof State[EntityName]>;
    },
  ): void;
  peek: EventAccessFn<EventMap>;
}

export type { ReadonlyDeep };

export interface EntityRepository<Entities extends PatchableEntities> {
  (): ReadonlyDeep<Entities>;
  keys: () => Generator<keyof Entities>;
  values: () => Generator<ReadonlyDeep<Entities[keyof Entities]>>;
  set: (id: keyof Entities, entity: Entities[keyof Entities]) => void;
  update: (
    id: keyof Entities,
    addUpdates: (
      builder: Omit<EntityUpdateBuilder<Entities[keyof Entities]>, "build">,
    ) => void,
  ) => void;
  remove: (id: keyof Entities) => void;
}

/**
 * This may seem excessive but it exists because typescript does not support Subset<T> (and no, Partial<T> doesn't work, or any other hack).
 * We want to be able to update any subset of an entity but we do not want to allow padding in undefined, which is what Partial<T> would allow.
 */
class EntityUpdateBuilder<Entity> {
  private update: Partial<Entity> = {};

  add<K extends keyof Entity>(key: K, newValue: Entity[K]): this {
    this.update[key] = newValue;
    return this;
  }

  build(): Partial<Entity> {
    return this.update;
  }
}

export interface SyncStateMachineOptions<
  State extends PatchableState,
  EventMap extends SyncEventMap,
> {
  initialState: State;
  clientVisibility: ClientVisibilityFactory<State>;
  clientIds: () => Iterable<ClientId>;
  patchOptimizer?: () => PatchOptimizer<State, EventMap> | undefined;
}
