import { enablePatches, produceWithPatches, type Patch } from "immer";
import type { ClientId } from "./shared";

enablePatches();

export class SyncStateMachine<State extends SyncState> {
  private state: State;

  constructor(private options: SyncStateMachineOptions<State>) {
    this.state = options.state();
  }

  access = <Result>(
    accessFn: StateAccessFn<State, Result>,
  ): [Result, ClientPatches] => {
    let result!: Result;

    const [nextState, patches] = produceWithPatches(this.state, (draft) => {
      result = accessFn(draft as State);
    });

    this.state = nextState;

    const clientPatches: ClientPatches = {};

    // TODO

    return [result, clientPatches];
  };

  readClientState = (clientId: ClientId): State => {
    const clientReferences = this.options.clientReferences(
      clientId,
      this.state,
    );
    return Object.fromEntries(
      Object.entries(clientReferences).map(([entityName, entityIds]) => {
        const allEntities = this.state[entityName];
        const referencedEntities = Object.fromEntries(
          entityIds.map((id) => [id, allEntities[id]]),
        );
        return [entityName, referencedEntities];
      }),
    ) as State;
  };
}

export interface SyncStateMachineOptions<State extends SyncState> {
  state: () => State;
  clientReferences: (
    clientId: ClientId,
    state: State,
  ) => ClientReferences<State>;
  clientIds: () => ClientId[];
}

export type ClientPatches = Record<ClientId, Patch[]>;

export type StateAccessFn<State extends SyncState, Result> = (
  draft: State,
) => Result;

export type EntityLookup = { [entityId: PropertyKey]: unknown };

export type SyncState = { [entityName: PropertyKey]: EntityLookup };

export type ClientReferences<State extends SyncState> = {
  [EntityName in keyof State]: Array<keyof State[EntityName]>;
};
