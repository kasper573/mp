import type { Patch } from "immer";
import type { ClientId } from "./shared";

export class SyncStateMachine<State extends SyncState> {
  constructor(private options: SyncStateMachineOptions<State>) {}

  access = <Result>(
    fn: StateAccessFn<State, Result>,
  ): [Result, ClientPatches] => {
    throw new Error("Not implemented");
  };

  readClientState = (clientId: ClientId): State => {
    throw new Error("Not implemented");
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

export type SyncState = Record<PropertyKey, Record<PropertyKey, unknown>>;

export type ClientReferences<State extends SyncState> = {
  [Property in keyof State]: Array<keyof State[Property]>;
};
