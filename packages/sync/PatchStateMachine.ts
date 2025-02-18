import type { Operation } from "rfc6902";
import { type Patch, Pointer } from "rfc6902";
import type { ReadonlyDeep } from "type-fest";
import type { ClientId } from "./shared";

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
    get(_, prop) {
      if (prop === flushFunctionName) {
        return flush;
      }
      const entityName = prop as keyof State;
      return (repositories[entityName] ??= createEntityRepository(
        state,
        serverPatch,
        entityName,
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

  return () => {
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

      for (const entityName in state) {
        const prevIds = prevVisibility[entityName];
        const nextIds = nextVisibility[entityName];
        const entityPath = new Pointer().add(entityName);

        for (const addedId of nextIds.difference(prevIds)) {
          clientPatch.push({
            op: "add",
            path: entityPath.add(addedId as string).toString(),
            value: state[entityName][addedId],
          });
        }

        for (const removedId of prevIds.difference(nextIds)) {
          clientPatch.push({
            op: "remove",
            path: entityPath.add(removedId as string).toString(),
          });
        }
      }

      clientPatch.push(
        ...serverPatch.filter(({ path }) => {
          const [, entityName, entityId] = Pointer.fromJSON(path).tokens;
          return nextVisibility[entityName].has(entityId);
        }),
      );

      if (clientPatch.length > 0) {
        clientPatches.set(clientId, clientPatch);
      }
    }

    serverPatch.splice(0, serverPatch.length);

    return clientPatches;
  };
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
): EntityRepository<State[EntityName]> {
  type Entities = State[EntityName];
  type Id = keyof Entities;
  type Entity = Entities[Id];

  function fn() {
    // Type level immutability is enough, we don't need to check at runtime as it will impact performance
    return state[entityName] as ReadonlyDeep<Entities>;
  }

  const basePath = new Pointer().add(entityName as string);

  fn.set = (id: Id, entity: Entity) => {
    serverPatch.push({
      op: "replace",
      path: basePath.add(id as string).toString(),
      value: structuredClone(entity),
    });
    state[entityName][id] = entity;
  };

  fn.update = (id: Id, value: Partial<Entity>) => {
    const path = basePath.add(id as string);
    for (const prop in value) {
      const key = prop as keyof Entity;
      serverPatch.push(
        createSetOperation(
          path.add(prop),
          value[key],
          state[entityName][id][key],
        ),
      );
    }
    Object.assign(state[entityName][id] as object, value);
  };

  fn.remove = (id: Id) => {
    serverPatch.push({
      op: "remove",
      path: basePath.add(id as string).toString(),
    });
    delete state[entityName][id];
  };

  return fn;
}

function createFullStatePatch<State extends PatchableState>(
  state: State,
): Patch {
  const patch: Patch = [];
  const path = new Pointer();
  for (const key in state) {
    patch.push({
      op: "add",
      path: path.add(key).toString(),
      value: state[key as keyof typeof state],
    });
  }
  return patch;
}

function createSetOperation<Value>(
  path: Pointer,
  nextValue: Value,
  prevValue: Value,
): Operation {
  if (nextValue === undefined && prevValue !== undefined) {
    return { op: "remove", path: path.toString() };
  }
  if (nextValue !== undefined && prevValue === undefined) {
    return {
      op: "add",
      path: path.toString(),
      value: structuredClone(nextValue),
    };
  }
  return {
    op: "replace",
    path: path.toString(),
    value: structuredClone(nextValue),
  };
}

const flushFunctionName = "flush";

export type PatchStateMachine<State extends PatchableState> =
  EntityRepositoryRecord<State> & {
    [flushFunctionName]: FlushFn;
  };

export type EntityRepositoryRecord<State extends PatchableState> = {
  [EntityName in keyof State]: EntityRepository<State[EntityName]>;
};

type FlushFn = () => ClientPatches;

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
