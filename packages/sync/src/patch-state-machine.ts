import type { ReadonlyDeep } from "type-fest";
import type { Patch, PatchPath } from "./patch";

/**
 * A state machine that records all state changes made as atomic patches,
 * is aware of which patches should be visible per client,
 * and allows flushing the collected patches at any given time.
 */
export type PatchStateMachine<State extends PatchableState> =
  EntityRepositoryRecord<State> & {
    [flushFunctionName]: FlushFn;
  };

export function createPatchStateMachine<State extends PatchableState>(
  opt: PatchStateMachineOptions<State>,
): PatchStateMachine<State> {
  const state = structuredClone(opt.initialState);
  const serverPatch: Patch = [];
  const flush = createFlushFunction(
    state,
    serverPatch,
    opt.clientIds,
    opt.clientVisibility,
  );
  const repositories = {} as EntityRepositoryRecord<State>;
  return new Proxy({} as PatchStateMachine<State>, {
    get(target, prop) {
      if (prop === flushFunctionName) {
        return flush;
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
            [entityName, addedId] as PatchPath,
            state[entityName][addedId],
          ]);
        }

        for (const removedId of prevIds.difference(nextIds)) {
          clientPatch.push([[entityName, removedId] as PatchPath]);
        }
      }

      // Select the patches visible to the client

      clientPatch.push(
        ...serverPatch.filter(([[entityName, entityId]]) => {
          return nextVisibility[entityName].has(entityId);
        }),
      );

      if (clientPatch.length > 0) {
        clientPatches.set(clientId, clientPatch);
      }
    }

    serverPatch.splice(0, serverPatch.length);

    return clientPatches;
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

function createEntityRepository<
  State extends PatchableState,
  EntityName extends keyof State,
>(
  state: State,
  serverPatch: Patch,
  entityName: EntityName,
  allPatchOptimizers?: EntityPatchOptimizerRecord<State>,
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
    serverPatch.push([[entityName, id] as PatchPath, entity]);
    state[entityName][id] = entity;
  };

  entity.update = function updateEntity(id: Id, value: Partial<Entity>) {
    const entityInstance = state[entityName][id] as Entity;

    for (const prop in value) {
      const key = prop as keyof Entity;
      const newValue = value[key] as Entity[keyof Entity];
      const oldValue = entityInstance[key];

      const patch = optimizePatchOperationValue(
        entityPatchOptimizer?.[key],
        newValue,
        oldValue,
      );

      if (patch) {
        serverPatch.push([[entityName, id, prop] as PatchPath, patch.value]);
      }

      entityInstance[key] = newValue;
    }
  };

  entity.remove = function removeEntity(id: Id) {
    serverPatch.push([[entityName, id] as PatchPath]);
    delete state[entityName][id];
  };

  return entity;
}

export type EntityPatchOptimizerRecord<State extends PatchableState> = {
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
  filter?: (newValue: Entity[Key], oldValue: Entity[Key]) => boolean;
  transform?: (value: Entity[Key]) => Entity[Key];
}

function optimizePatchOperationValue<Entity, Key extends keyof Entity>(
  optimizer: PropertyPatchOptimizer<Entity, Key> | undefined,
  newValue: Entity[Key],
  oldValue: Entity[Key],
): { value: Entity[Key] } | undefined {
  if (optimizer?.transform) {
    newValue = optimizer.transform(newValue);
    oldValue = optimizer.transform(oldValue);
  }
  if (optimizer?.filter && !optimizer.filter(newValue, oldValue)) {
    return;
  }
  return { value: newValue };
}

function createFullStatePatch<State extends PatchableState>(
  state: State,
): Patch {
  const patch: Patch = [];
  for (const key in state) {
    patch.push([[key], state[key as keyof typeof state]]);
  }
  return patch;
}

const flushFunctionName = "$flush"; // $ to avoid collision with user defined properties

export type EntityRepositoryRecord<State extends PatchableState> = {
  [EntityName in keyof State]: EntityRepository<State[EntityName]>;
};

interface FlushFn {
  (): ClientPatches;
  markToResendFullState(...clientIds: ClientId[]): void;
}

export type { ReadonlyDeep };

export interface EntityRepository<Entities extends PatchableEntities> {
  (): ReadonlyDeep<Entities>;
  set: (id: keyof Entities, entity: Entities[keyof Entities]) => void;
  update: (
    id: keyof Entities,
    entity: Partial<Entities[keyof Entities]> & object,
  ) => void;
  remove: (id: keyof Entities) => void;
}

export interface PatchStateMachineOptions<State extends PatchableState> {
  initialState: State;
  clientVisibility: ClientVisibilityFactory<State>;
  clientIds: () => Iterable<ClientId>;
  patchOptimizers?: EntityPatchOptimizerRecord<State>;
}

export type ClientVisibilityFactory<State extends PatchableState> = (
  clientId: ClientId,
  state: State,
) => ClientVisibility<State>;

export type ClientPatches = Map<ClientId, Patch>;

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
