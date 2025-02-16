import { enablePatches, original, produceWithPatches, type Patch } from "immer";
import type { ClientId } from "./shared";

enablePatches();

export class SyncStateMachine<State extends SyncState> {
  private state: State;
  private visibilities: Record<ClientId, ClientVisibility<State> | undefined> =
    {};

  constructor(private options: SyncStateMachineOptions<State>) {
    this.state = options.state();
  }

  access = <Result>(
    accessFn: StateHandler<State, Result>,
  ): [Result, ClientPatches] => {
    const { clientIds, clientVisibility } = this.options;

    let result!: Result;
    const [nextState, patches] = produceWithPatches(this.state, (draft) => {
      result = accessFn(draft as State);

      if (result && typeof result === "object") {
        result = original(result) as Result;
      }
      if (result instanceof Promise) {
        throw new TypeError("State access mutations may not be asynchronous");
      }
    });

    if (nextState === this.state) {
      return [result, {}];
    }

    const prevState = this.state;
    this.state = nextState;

    const clientPatches: ClientPatches = {};

    for (const clientId of clientIds()) {
      const prevVisibility =
        this.visibilities[clientId] ?? clientVisibility(clientId, prevState);

      const nextVisibility = clientVisibility(clientId, nextState);

      const patchesForClient: Patch[] = [];

      for (const entityName in this.state) {
        const prevIds = prevVisibility[entityName];
        const nextIds = nextVisibility[entityName];

        for (const addedId of nextIds.difference(prevIds)) {
          patchesForClient.push({
            op: "add",
            path: [entityName, idEncoder.encode(addedId)],
            value: nextState[entityName][addedId],
          });
        }

        for (const removedId of prevIds.difference(nextIds)) {
          patchesForClient.push({
            op: "remove",
            path: [entityName, idEncoder.encode(removedId)],
          });
        }
      }

      patchesForClient.push(
        ...patches.filter(({ path: [entityName, entityId] }) =>
          nextVisibility[entityName].has(idEncoder.decode(entityId)),
        ),
      );

      this.visibilities[clientId] = nextVisibility;
      if (patchesForClient.length > 0) {
        clientPatches[clientId] = patchesForClient;
      }
    }

    return [result, clientPatches];
  };

  readClientState = (clientId: ClientId): State => {
    const clientReferences = this.options.clientVisibility(
      clientId,
      this.state,
    );
    return Object.fromEntries(
      Object.entries(clientReferences).map(
        ([entityName, entityIds]: [string, ReadonlySet<EntityId>]) => {
          const allEntities = this.state[entityName];
          const referencedEntities = Object.fromEntries(
            entityIds.values().map((id) => [id, allEntities[id]]),
          );
          return [entityName, referencedEntities];
        },
      ),
    ) as State;
  };
}

const asString = <Ret>(value: PropertyKey): Ret => String(value) as Ret;

const idEncoder = {
  encode: asString,
  decode: asString,
};

export interface SyncStateMachineOptions<State extends SyncState> {
  state: () => State;
  clientVisibility: ClientVisibilityFactory<State>;
  clientIds: () => Iterable<ClientId>;
}

export type ClientVisibilityFactory<State extends SyncState> = (
  clientId: ClientId,
  state: State,
) => ClientVisibility<State>;

export type ClientPatches = Record<ClientId, Patch[]>;

export type StateHandler<State, Result> = (draft: State) => Result;

export type StateAccess<State extends SyncState> = <Result>(
  stateHandler: StateHandler<State, Result>,
) => Result;

export type EntityId = string;

export type EntityLookup = { [entityId: EntityId]: unknown };

export type SyncState = { [entityName: string]: EntityLookup };

export type ClientVisibility<State extends SyncState> = {
  [EntityName in keyof State]: ReadonlySet<keyof State[EntityName]>;
};
