import type { ReadonlyDeep } from "type-fest";
import * as Automerge from "@automerge/automerge";

export function createServerCRDT<T extends Record<string, unknown>, Id>(
  initialState: T,
  filterState: (state: T, clientId: Id) => T,
): ServerCRDT<T, Id> {
  let document = Automerge.from(initialState);

  const syncStates = new Map<Id, Automerge.SyncState>();

  // TODO use filterState to only emit a subset of the state

  return {
    access(change) {
      let result;
      document = Automerge.change(document, (draft: T) => {
        result = change(draft);
      });
      return result as ReadonlyDeep<ReturnType<typeof change>>;
    },
    flush: function* (clientIds) {
      for (const clientId of clientIds) {
        const syncState = syncStates.get(clientId) ?? Automerge.initSyncState();
        const [newSyncState, msg] = Automerge.generateSyncMessage(
          document,
          syncState,
        );
        syncStates.set(clientId, newSyncState);
        if (msg?.length) {
          yield [clientId, msg];
        }
      }
    },
  };
}

export function createClientCRDT<T extends Record<string, unknown>>(
  initialState: T,
): ClientCRDT<T> {
  let document = Automerge.from(initialState);
  let syncState = Automerge.initSyncState();

  return {
    update(syncMessage) {
      if (syncMessage.length > 0) {
        [document, syncState] = Automerge.receiveSyncMessage(
          document,
          syncState,
          syncMessage,
        );
      }
    },
    access: () => document,
  };
}

export interface ServerCRDT<T, Id> {
  /**
   * Get access to a mutable draft of the state.
   * If a value is returned from the callback, it will be returned from the
   * `access` function.
   */
  access: StateAccess<T>;
  /**
   * Flush all enqueued changes and construct client
   * specific state updates for each given client id.
   */
  flush: (clientIds: Iterable<Id>) => Generator<[Id, StateUpdate]>;
}

export type StateAccess<T> = <R>(fn: (draft: T) => R) => ReadonlyDeep<R>;

export interface ClientCRDT<T> {
  update: (msg: StateUpdate) => void;
  access: () => T;
}

export type StateUpdate = Automerge.SyncMessage;
