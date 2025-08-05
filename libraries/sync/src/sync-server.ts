import type { EventAccessFn, SyncEvent, SyncEventMap } from "./sync-event";
import type { Operation, Patch } from "./types";

export class SyncServer<State, EventMap extends SyncEventMap, ClientId> {
  private events: ServerSyncEvent<State>[] = [];
  private hasBeenGivenFullState = new Set<ClientId>();
  private visibilities = new Map<ClientId, ClientVisibility<State>>();

  constructor(private options: SyncServerOptions<State, ClientId>) {}

  flush(system: SyncSystem<State>): FlushResult<ClientId> {
    const clientIds = Array.from(this.options.clientIds());
    const prevVisibilities = Object.fromEntries(
      clientIds.map((clientId) => [
        clientId,
        this.visibilities.get(clientId) ?? // Reuse last if it exists
          this.options.clientVisibility(clientId, system.entities), // Derive new if not
      ]),
    );

    const serverPatch = system.flush();

    const clientPatches: ClientPatches<ClientId> = new Map();
    const clientEvents: ClientEvents<ClientId> = new Map();

    for (const clientId of clientIds) {
      const prevVisibility =
        prevVisibilities[clientId as keyof typeof prevVisibilities];
      const nextVisibility = this.options.clientVisibility(
        clientId,
        system.entities,
      );

      this.visibilities.set(clientId, nextVisibility);

      const clientPatch: Patch = [];
      if (!this.hasBeenGivenFullState.has(clientId)) {
        appendFullStatePatch(system.entities, nextVisibility, clientPatch);
        this.hasBeenGivenFullState.add(clientId);
      } else {
        clientPatch.push(...patchVisibilityFilter(serverPatch, nextVisibility));

        // Emulate adds and removals of entities due to visibility changes
        for (const entityName in system.entities) {
          const prevIds = prevVisibility[entityName];
          const nextIds = nextVisibility[entityName];

          const addedIds = nextIds.difference(prevIds);
          if (addedIds.size) {
            system.emulateAddPatches(
              entityName,
              nextIds.difference(prevIds),
              clientPatch,
            );
          }

          const removedIds = prevIds.difference(nextIds);
          if (removedIds.size) {
            clientPatch.push({ entityName, removedIds });
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
      [EntityName in keyof State]?: Iterable<EntityId>;
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

/**
 * Creates a copy of the given patch but with entities filtered by visibility.
 */
function patchVisibilityFilter<State>(
  patch: Patch,
  visibility: ClientVisibility<State>,
): Patch {
  const filteredPatch: Patch = [];
  for (let op of patch) {
    const filteredOp: Operation = { entityName: op.entityName };
    const visibleEntityIds = visibility[op.entityName as keyof State];

    filteredOp.removedIds = op.removedIds
      ? op.removedIds.difference(new Set(visibleEntityIds))
      : undefined;

    if (op.changes) {
      filteredOp.changes = {};
      for (const entityId in op.changes) {
        if (visibleEntityIds.has(entityId)) {
          filteredOp.changes[entityId] = op.changes[entityId];
        }
      }
    }

    filteredPatch.push(filteredOp);
  }
  return filteredPatch;
}

function isVisible<State>(
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

function appendFullStatePatch<State>(
  entities: SyncEntities<State>,
  visibility: ClientVisibility<State>,
  patch: Patch,
): void {
  for (const entityName in entities) {
    const entityIds = visibility[entityName];
    const map = entities[entityName];
    const changes = map.selectFlat(entityIds);
    patch.push({ entityName, changes });
  }
}

export interface FlushResult<ClientId> {
  clientPatches: ClientPatches<ClientId>;
  clientEvents: ClientEvents<ClientId>;
}

export interface ServerSyncEvent<State> {
  event: SyncEvent;
  /**
   * If specified, this event will only be sent to clients that have the specified visibility.
   */
  visibility?: ClientVisibility<State>;
}

export interface SyncServerOptions<State, ClientId> {
  clientVisibility: ClientVisibilityFactory<State, ClientId>;
  clientIds: () => Iterable<ClientId>;
}

export type ClientVisibilityFactory<State, ClientId> = (
  clientId: ClientId,
  entities: SyncEntities<State>,
) => ClientVisibility<State>;

export type ClientPatches<ClientId> = Map<ClientId, Patch>;

export type ClientEvents<ClientId> = Map<ClientId, SyncEvent[]>;

export type ClientVisibility<State> = {
  [EntityName in keyof State]: ReadonlySet<EntityId>;
};
