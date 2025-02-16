import { enablePatches, produceWithPatches, type Patch } from "immer";
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
    accessFn: StateAccessFn<State, Result>,
  ): [Result, ClientPatches] => {
    let result!: Result;
    const { clientIds, clientVisibility } = this.options;

    const [nextState, patches] = produceWithPatches(this.state, (draft) => {
      result = accessFn(draft as State);
    });

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
            path: [entityName, String(addedId)],
            value: nextState[entityName][addedId],
          });
        }

        for (const removedId of prevIds.difference(nextIds)) {
          patchesForClient.push({
            op: "remove",
            path: [entityName, String(removedId)],
          });
        }
      }

      patchesForClient.push(
        ...patches.filter(({ path: [entityName, entityId] }) =>
          nextVisibility[entityName].has(entityId),
        ),
      );

      this.visibilities[clientId] = nextVisibility;
      clientPatches[clientId] = patchesForClient;
    }

    return [result, clientPatches];
  };

  readClientState = (clientId: ClientId): State => {
    const clientReferences = this.options.clientVisibility(
      clientId,
      this.state,
    );
    return Object.fromEntries(
      Object.entries(clientReferences).map(([entityName, entityIds]) => {
        const allEntities = this.state[entityName];
        const referencedEntities = Object.fromEntries(
          entityIds.values().map((id) => [id, allEntities[id]]),
        );
        return [entityName, referencedEntities];
      }),
    ) as State;
  };
}

export interface SyncStateMachineOptions<State extends SyncState> {
  state: () => State;
  clientVisibility: (
    clientId: ClientId,
    state: State,
  ) => ClientVisibility<State>;
  clientIds: () => ClientId[];
}

export type ClientPatches = Record<ClientId, Patch[]>;

export type StateAccessFn<State extends SyncState, Result> = (
  draft: State,
) => Result;

export type EntityLookup = { [entityId: PropertyKey]: unknown };

export type SyncState = { [entityName: PropertyKey]: EntityLookup };

export type ClientVisibility<State extends SyncState> = {
  [EntityName in keyof State]: ReadonlySet<keyof State[EntityName]>;
};
