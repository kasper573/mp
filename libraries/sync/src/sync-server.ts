import { PatchOpCode, type Operation, type Patch } from "@mp/patch";
import { SyncMap } from "./sync-map";

import type { EventAccessFn, SyncEvent, SyncEventMap } from "./sync-event";

export class SyncServer<
  State extends PatchableState,
  EventMap extends SyncEventMap,
  ClientId,
> {
  private events: ServerSyncEvent<State>[] = [];
  private hasBeenGivenFullState = new Set<ClientId>();
  private visibilities = new Map<ClientId, ClientVisibility<State>>();

  constructor(private options: SyncServerOptions<State, ClientId>) {}

  flush(state: State): FlushResult<ClientId> {
    const clientIds = Array.from(this.options.clientIds());
    const prevVisibilities: Record<
      ClientId & string,
      ClientVisibility<State>
    > = Object.fromEntries(
      clientIds.map((clientId) => [
        clientId,
        this.visibilities.get(clientId) ?? // Reuse last if it exists
          this.options.clientVisibility(clientId, state), // Derive new if not
      ]),
    );

    const serverPatch = this.flushState(state);

    const clientPatches: ClientPatches<ClientId> = new Map();
    const clientEvents: ClientEvents<ClientId> = new Map();

    for (const clientId of clientIds) {
      const prevVisibility =
        prevVisibilities[clientId as keyof typeof prevVisibilities];
      const nextVisibility = this.options.clientVisibility(clientId, state);
      const clientPatch: Patch = [];

      this.visibilities.set(clientId, nextVisibility);

      if (!this.hasBeenGivenFullState.has(clientId)) {
        const clientState = deriveClientState(state, nextVisibility);
        appendFullStatePatch(clientState, clientPatch);
        this.hasBeenGivenFullState.add(clientId);
      }

      // Emulate adds and removals of entities due to visibility changes

      for (const entityName in state) {
        const prevIds = prevVisibility[entityName];
        const nextIds = nextVisibility[entityName];

        for (const addedId of nextIds.difference(prevIds)) {
          clientPatch.push({
            op: PatchOpCode.MapSet,
            path: [entityName],
            key: addedId,
            value: state[entityName].get(addedId),
          });
        }

        for (const removedId of prevIds.difference(nextIds)) {
          clientPatch.push({
            op: PatchOpCode.MapDelete,
            path: [entityName],
            key: removedId,
          });
        }
      }

      // Select the patches visible to the client

      clientPatch.push(
        ...serverPatch.filter((op) => {
          const { entityName, entityId } = inspectOperation(op);
          return entityId === undefined
            ? false
            : nextVisibility[entityName].has(entityId as never);
        }),
      );

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

  private flushState(state: State): Patch {
    const patch: Patch = [];
    for (const [entityName, map] of Object.entries(state)) {
      if (map instanceof SyncMap) {
        map.flush([entityName], patch);
      }
    }
    return patch;
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

function inspectOperation(op: Operation) {
  const [entityName, entityId] = op.path;
  if (entityId !== undefined) {
    return { entityName, entityId };
  }
  if ("key" in op) {
    return { entityName, entityId: op.key };
  }
  return { entityName };
}

function deriveClientState<State extends PatchableState>(
  state: State,
  visibilities: ClientVisibility<State>,
): State {
  const derivedState = {} as State;
  for (const entityName in visibilities) {
    const entityIds = visibilities[entityName];
    const map = state[entityName];
    const derivedMap = new SyncMap(
      entityIds.values().map((id) => [id, map.get(id)]),
    );
    derivedState[entityName] = derivedMap as never;
  }
  return derivedState;
}

function isVisible<State extends PatchableState>(
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

function appendFullStatePatch<State extends PatchableState>(
  state: State,
  patch: Patch,
): void {
  for (const entityName in state) {
    const entities = state[entityName as keyof typeof state];
    patch.push({
      op: PatchOpCode.MapReplace,
      path: [entityName],
      entries: Array.from(entities.entries()),
    });
  }
}

export interface FlushResult<ClientId> {
  clientPatches: ClientPatches<ClientId>;
  clientEvents: ClientEvents<ClientId>;
}

export interface ServerSyncEvent<State extends PatchableState> {
  event: SyncEvent;
  /**
   * If specified, this event will only be sent to clients that have the specified visibility.
   */
  visibility?: ClientVisibility<State>;
}

export interface SyncServerOptions<State extends PatchableState, ClientId> {
  clientVisibility: ClientVisibilityFactory<State, ClientId>;
  clientIds: () => Iterable<ClientId>;
}

export type ClientVisibilityFactory<State extends PatchableState, ClientId> = (
  clientId: ClientId,
  state: State,
) => ClientVisibility<State>;

export type ClientPatches<ClientId> = Map<ClientId, Patch>;

export type ClientEvents<ClientId> = Map<ClientId, SyncEvent[]>;

export type ClientVisibility<State extends PatchableState> = {
  [EntityName in keyof State]: ReadonlySet<inferEntityId<State[EntityName]>>;
};

export type PatchableEntityId = string;

export type PatchableEntities<Id extends PatchableEntityId, Entity> = Map<
  Id,
  Entity
>;

export type inferEntityId<Entities> =
  Entities extends PatchableEntities<infer Id, infer _> ? Id : never;

export type inferEntityValue<Entities> =
  Entities extends PatchableEntities<infer _, infer Entity> ? Entity : never;

export interface PatchableState {
  // oxlint-disable-next-line no-explicit-any
  [entityName: string]: PatchableEntities<PatchableEntityId, any>;
}
