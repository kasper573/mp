import type { ReadonlyDeep } from "type-fest";
import { PatchType, type Patch, type PatchPath } from "./patch";
import { dedupePatch } from "./patch-deduper";
import type { PatchOptimizer } from "./patch-optimizer";
import { optimizeUpdate } from "./patch-optimizer";
import type { SyncEvent, SyncEventMap } from "./sync-event";

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
>(opt: SyncStateMachineOptions<State>): SyncStateMachine<State, EventMap> {
  const state = structuredClone(opt.initialState);
  const serverPatch: Patch = [];
  const serverEvents: ServerSyncEvent<State>[] = [];
  const flushFn = createFlushFunction(
    state,
    serverPatch,
    serverEvents,
    opt.clientIds,
    opt.clientVisibility,
  );
  const eventFn = createEventFunction(serverEvents);
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
        serverPatch,
        entityName,
        opt.patchOptimizers,
      ));
    },
  });
}

function createFlushFunction<State extends PatchableState>(
  state: State,
  serverPatch: Patch,
  serverEvents: ServerSyncEvent<State>[],
  getClientIds: () => Iterable<ClientId>,
  getClientVisibility: ClientVisibilityFactory<State>,
): FlushFn {
  const hasBeenGivenFullState = new Set<ClientId>();
  const visibilities: Map<ClientId, ClientVisibility<State>> = new Map();

  function flush() {
    const clientIds = Array.from(getClientIds());
    const prevVisibilities: Record<
      ClientId,
      ClientVisibility<State>
    > = Object.fromEntries(
      clientIds.map((clientId) => [
        clientId,
        visibilities.get(clientId) ?? // Reuse last if it exists
          getClientVisibility(clientId, state), // Derive new if not
      ]),
    );

    const clientPatches: ClientPatches = new Map();
    const clientEvents: ClientEvents = new Map();

    for (const clientId of clientIds) {
      const prevVisibility = prevVisibilities[clientId];
      const nextVisibility = getClientVisibility(clientId, state);
      const clientPatch: Patch = [];

      visibilities.set(clientId, nextVisibility);

      if (!hasBeenGivenFullState.has(clientId)) {
        clientPatch.push(
          ...createFullStatePatch(deriveClientState(state, nextVisibility)),
        );
        hasBeenGivenFullState.add(clientId);
      }

      // Emulate adds and removals of entities due to visibility changes

      for (const entityName in state) {
        const prevIds = prevVisibility[entityName];
        const nextIds = nextVisibility[entityName];

        for (const addedId of nextIds.difference(prevIds)) {
          clientPatch.push([
            PatchType.Set,
            [entityName, addedId] as PatchPath,
            state[entityName][addedId],
          ]);
        }

        for (const removedId of prevIds.difference(nextIds)) {
          clientPatch.push([
            PatchType.Remove,
            [entityName, removedId] as PatchPath,
          ]);
        }
      }

      // Select the patches visible to the client

      clientPatch.push(
        ...serverPatch.filter(([type, [entityName, entityId]]) => {
          return entityId === undefined
            ? false
            : nextVisibility[entityName].has(entityId);
        }),
      );

      if (clientPatch.length > 0) {
        clientPatches.set(clientId, dedupePatch(clientPatch));
      }
      if (serverEvents.length > 0) {
        clientEvents.set(
          clientId,
          serverEvents
            .filter(({ visibility }) => isVisible(nextVisibility, visibility))
            .map(({ event }) => event),
        );
      }
    }

    serverPatch.splice(0, serverPatch.length);
    serverEvents.splice(0, serverEvents.length);

    return { clientPatches, clientEvents };
  }

  flush.markToResendFullState = (...clientIds: ClientId[]) => {
    for (const clientId of clientIds) {
      hasBeenGivenFullState.delete(clientId);
    }
  };

  return flush;
}

function deriveClientState<State extends PatchableState>(
  state: State,
  visibilities: ClientVisibility<State>,
): State {
  return Object.fromEntries(
    Object.entries(visibilities).map(
      ([entityName, entityIds]: [string, ReadonlySet<PatchableEntityId>]) => {
        const allEntities = state[entityName];
        const referencedEntities = Object.fromEntries(
          entityIds.values().map((id) => [id, allEntities[id]]),
        );
        return [entityName, referencedEntities];
      },
    ),
  ) as State;
}

function isVisible<State extends PatchableState>(
  subject: ClientVisibility<State>,
  required?: ClientVisibility<State>,
): boolean {
  if (required) {
    for (const entityName in required) {
      const requiredIds = required[entityName];
      const subjectIds = subject[entityName];
      if (!requiredIds.isSubsetOf(subjectIds)) {
        return false;
      }
    }
  }
  return true;
}

function createEntityRepository<
  State extends PatchableState,
  EntityName extends keyof State,
>(
  state: State,
  serverPatch: Patch,
  entityName: EntityName,
  allPatchOptimizers: PatchOptimizer<State> | undefined,
): EntityRepository<State[EntityName]> {
  type Entities = State[EntityName];
  type Id = keyof Entities;
  type Entity = Entities[Id];

  const entityPatchOptimizer = allPatchOptimizers?.[entityName];

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
      entityPatchOptimizer,
      entity,
      updates,
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

  return entity;
}

function createFullStatePatch<State extends PatchableState>(
  state: State,
): Patch {
  const patch: Patch = [];
  for (const key in state) {
    patch.push([PatchType.Set, [key], state[key as keyof typeof state]]);
  }
  return patch;
}

// $ to avoid collision with user defined properties
const eventFunctionName = "$event";
const flushFunctionName = "$flush";

export type EntityRepositoryRecord<State extends PatchableState> = {
  [EntityName in keyof State]: EntityRepository<State[EntityName]>;
};

interface FlushResult {
  clientPatches: ClientPatches;
  clientEvents: ClientEvents;
}

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
    visibilities?: ClientVisibility<State>,
  ): void;
}

interface ServerSyncEvent<State extends PatchableState> {
  event: SyncEvent;
  /**
   * If specified, this event will only be sent to clients that have the specified visibility.
   */
  visibility?: ClientVisibility<State>;
}

function createEventFunction<
  EventMap extends SyncEventMap,
  State extends PatchableState,
>(serverEvents: ServerSyncEvent<State>[]): EventFn<EventMap, State> {
  return (eventName, payload, visibilities) => {
    serverEvents.push({
      event: [String(eventName), payload],
      visibility: visibilities,
    });
  };
}

export type { ReadonlyDeep };

export interface EntityRepository<Entities extends PatchableEntities> {
  (): ReadonlyDeep<Entities>;
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

export interface SyncStateMachineOptions<State extends PatchableState> {
  initialState: State;
  clientVisibility: ClientVisibilityFactory<State>;
  clientIds: () => Iterable<ClientId>;
  patchOptimizers?: PatchOptimizer<State>;
}

export type ClientVisibilityFactory<State extends PatchableState> = (
  clientId: ClientId,
  state: State,
) => ClientVisibility<State>;

export type ClientPatches = Map<ClientId, Patch>;

export type ClientEvents = Map<ClientId, SyncEvent[]>;

export type ClientVisibility<State extends PatchableState> = {
  [EntityName in keyof State]: ReadonlySet<keyof State[EntityName]>;
};

export type PatchableEntityId = string;

export type PatchableEntity = unknown;

export type PatchableEntities = {
  [entityId: PatchableEntityId]: PatchableEntity;
};

export type PatchableState = { [entityName: string]: PatchableEntities };

type ClientId = Registry extends { clientId: infer T } ? T : string;

/**
 * Designed to be augmented by the consumer package to conveniently override the type of ClientId.
 * This avoids the need to pollute the generic parameters in all places where ClientId is used.
 */
export interface Registry {}
