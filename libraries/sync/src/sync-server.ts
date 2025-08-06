import type { AnyOperation, AnyPatch } from "./patch";
import { PatchOperationType } from "./patch";
import type { EventAccessFn, SyncEvent, SyncEventMap } from "./sync-event";
import type { SyncMap } from "./sync-map";
import type { AnySyncState } from "./sync-state";
import { flushState } from "./sync-state";

export class SyncServer<
  State extends AnySyncState,
  EventMap extends SyncEventMap,
  ClientId,
> {
  private events: ServerSyncEvent<State>[] = [];
  private hasBeenGivenFullState = new Set<ClientId>();
  private visibilities = new Map<ClientId, ClientVisibility<State>>();

  constructor(private options: SyncServerOptions<State, ClientId>) {}

  flush(state: State): FlushResult<ClientId> {
    const clientIds = Array.from(this.options.clientIds());
    const prevVisibilities = Object.fromEntries(
      clientIds.map((clientId) => [
        clientId,
        this.visibilities.get(clientId) ?? // Reuse last if it exists
          this.options.clientVisibility(clientId, state), // Derive new if not
      ]),
    );

    const serverPatch = flushState(state);

    const clientPatches: ClientPatches<ClientId> = new Map();
    const clientEvents: ClientEvents<ClientId> = new Map();

    for (const clientId of clientIds) {
      const prevVisibility =
        prevVisibilities[clientId as keyof typeof prevVisibilities];
      const nextVisibility = this.options.clientVisibility(clientId, state);

      this.visibilities.set(clientId, nextVisibility);

      const clientPatch: AnyPatch = [];
      if (!this.hasBeenGivenFullState.has(clientId)) {
        appendFullStatePatch(state, nextVisibility, clientPatch);
        this.hasBeenGivenFullState.add(clientId);
      } else {
        // Select operations that are visible to the client
        clientPatch.push(
          ...serverPatch.map((op) =>
            operationVisibilityFilter(op, nextVisibility),
          ),
        );

        // Emulate adds and removals of entities due to visibility changes
        for (const entityName in state) {
          const prevIds = prevVisibility[entityName];
          const nextIds = nextVisibility[entityName];

          const addedIds = nextIds.difference(prevIds);
          if (addedIds.size) {
            state[entityName].appendAddOperationToPatch(
              entityName,
              addedIds,
              clientPatch,
            );
          }

          const removedIds = prevIds.difference(nextIds);
          if (removedIds.size) {
            clientPatch.push({
              type: PatchOperationType.MapDelete,
              entityName,
              removedIds,
            });
          }
        }
      }

      if (clientPatch.length > 0) {
        clientPatches.set(clientId, clientPatch);
      }

      const visibleClientEvents = this.events
        .filter(({ visibility }) => isVisible(nextVisibility, visibility))
        .map(({ event }) => event);

      if (visibleClientEvents.length > 0) {
        clientEvents.set(clientId, visibleClientEvents);
      }
    }

    this.events.splice(0, this.events.length);

    return { clientPatches, clientEvents };
  }

  markToResendFullState(...clientIds: ClientId[]): void {
    for (const clientId of clientIds) {
      this.hasBeenGivenFullState.delete(clientId);
    }
  }

  addEvent<EventName extends keyof EventMap>(
    eventName: EventName,
    payload: EventMap[EventName],
    visibility?: {
      [EntityName in keyof State]?: Iterable<inferEntityId<State[EntityName]>>;
    },
  ): void {
    const newEvent: ServerSyncEvent<State> = {
      event: [String(eventName), payload],
    };
    if (visibility) {
      newEvent.visibility = {} as ClientVisibility<State>;
      for (const entityName in visibility) {
        newEvent.visibility[entityName] = new Set(visibility[entityName]);
      }
    }
    this.events.push(newEvent);
  }

  peekEvent: EventAccessFn<EventMap> = (eventName) => {
    return this.events
      .filter(({ event: [candidateName] }) => candidateName === eventName)
      .map(({ event: [, payload] }) => payload as never);
  };
}

function operationVisibilityFilter<State extends AnySyncState>(
  op: AnyOperation,
  visibilities: ClientVisibility<State>,
): AnyOperation {
  const vis = visibilities[op.entityName];
  switch (op.type) {
    case PatchOperationType.MapAdd: {
      return {
        type: PatchOperationType.MapAdd,
        entityName: op.entityName,
        added: op.added.filter(([id]) => vis.has(id as never)),
      };
    }
    case PatchOperationType.MapDelete:
      return {
        type: PatchOperationType.MapDelete,
        entityName: op.entityName,
        removedIds: op.removedIds.intersection(vis),
      };
    case PatchOperationType.EntityUpdate:
      return {
        type: PatchOperationType.EntityUpdate,
        entityName: op.entityName,
        changes: op.changes.filter(([id]) => vis.has(id as never)),
      };
  }
}

function isVisible<State extends AnySyncState>(
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

function appendFullStatePatch<State extends AnySyncState>(
  entities: State,
  visibility: ClientVisibility<State>,
  patch: AnyPatch,
): void {
  for (const entityName in entities) {
    const entityIds = visibility[entityName];
    const map = entities[entityName];
    patch.push({
      type: PatchOperationType.MapAdd,
      entityName,
      added: map.slice(entityIds),
    });
  }
}

export interface FlushResult<ClientId> {
  clientPatches: ClientPatches<ClientId>;
  clientEvents: ClientEvents<ClientId>;
}

export interface ServerSyncEvent<State extends AnySyncState> {
  event: SyncEvent;
  /**
   * If specified, this event will only be sent to clients that have the specified visibility.
   */
  visibility?: ClientVisibility<State>;
}

export interface SyncServerOptions<State extends AnySyncState, ClientId> {
  clientVisibility: ClientVisibilityFactory<State, ClientId>;
  clientIds: () => Iterable<ClientId>;
}

export type ClientVisibilityFactory<State extends AnySyncState, ClientId> = (
  clientId: ClientId,
  state: State,
) => ClientVisibility<State>;

export type ClientPatches<ClientId> = Map<ClientId, AnyPatch>;

export type ClientEvents<ClientId> = Map<ClientId, SyncEvent[]>;

type inferEntityId<T extends SyncMap<unknown, object>> =
  T extends SyncMap<infer EntityId, object> ? EntityId : never;

export type ClientVisibility<State extends AnySyncState> = {
  [EntityName in keyof State]: ReadonlySet<inferEntityId<State[EntityName]>>;
};
