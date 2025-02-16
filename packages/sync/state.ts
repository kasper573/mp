import type { Patch } from "immer";
import type { ClientId } from "./shared";

export class SyncStateMachine<State extends SyncState> {
  private state: State;

  constructor(private options: SyncStateMachineOptions<State>) {
    this.state = options.state();
  }

  access = <Result>(
    fn: StateAccessFn<State, Result>,
  ): [Result, ClientPatches] => {
    throw new Error("Not implemented");
  };

  readClientState = (clientId: ClientId): State => {
    const clientReferences = this.options.clientReferences(
      clientId,
      this.state,
    );
    return Object.fromEntries(
      Object.entries(clientReferences).map(([objectName, objectIds]) => {
        const allObjects = this.state[objectName];
        const referencedObjects = Object.fromEntries(
          objectIds.map((objectId) => [objectId, allObjects[objectId]]),
        );
        return [objectName, referencedObjects];
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

export type ObjectLookup = { [objectId: PropertyKey]: object };

export type SyncState = { [objectName: PropertyKey]: ObjectLookup };

export type ClientReferences<State extends SyncState> = {
  [ObjectName in keyof State]: Array<keyof State[ObjectName]>;
};
