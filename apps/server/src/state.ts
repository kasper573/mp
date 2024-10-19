import type { ReadonlyDeep } from "type-fest";
import * as Automerge from "@automerge/automerge";

export function createServerState<T extends Record<string, unknown>, Id>(
  initialState: T,
): ServerState<T, Id> {
  let document = Automerge.from(initialState);

  const syncStates = new Map<Id, Automerge.SyncState>();

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
        if (msg) {
          yield [clientId, msg];
        }
      }
    },
  };
}

export interface ServerState<T, Id> {
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

export function createClientState<T extends Record<string, unknown>, Id>(
  initialState: T,
) {
  let document = Automerge.from(initialState);
  let syncState = Automerge.initSyncState();

  function applyStateUpdate(msg: StateUpdate): void {
    [document, syncState] = Automerge.receiveSyncMessage(
      document,
      syncState,
      msg,
    );
  }

  const access = (): T => document as T;

  return { applyStateUpdate, access };
}

export type StateAccess<T> = <R>(fn: (draft: T) => R) => ReadonlyDeep<R>;

export type StateUpdate = Automerge.SyncMessage;
