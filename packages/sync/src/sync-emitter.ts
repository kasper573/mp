import type { Operation } from "./patch";
import {
  PatchType,
  prefixOperation,
  type Patch,
  type PatchPath,
} from "./patch";
import { isPatchCollectorRecord } from "./patch-collector";

import { dedupePatch } from "./patch-deduper";
import type { EventAccessFn } from "./sync-event";
import { type SyncEvent, type SyncEventMap } from "./sync-event";

// TODO think of a better name for this.
export class SyncEmitter<
  State extends PatchableState,
  EventMap extends SyncEventMap,
> {
  private events: ServerSyncEvent<State>[] = [];
  private hasBeenGivenFullState = new Set<ClientId>();
  private visibilities: Map<ClientId, ClientVisibility<State>> = new Map();

  constructor(private options: SyncEmitterOptions<State>) {}

  flush(state: State): FlushResult {
    const clientIds = Array.from(this.options.clientIds());
    const prevVisibilities: Record<
      ClientId,
      ClientVisibility<State>
    > = Object.fromEntries(
      clientIds.map((clientId) => [
        clientId,
        this.visibilities.get(clientId) ?? // Reuse last if it exists
          this.options.clientVisibility(clientId, state), // Derive new if not
      ]),
    );

    const serverPatch: Patch = Array.from(this.flushPatchCollectors());

    const clientPatches: ClientPatches = new Map();
    const clientEvents: ClientEvents = new Map();

    for (const clientId of clientIds) {
      const prevVisibility = prevVisibilities[clientId];
      const nextVisibility = this.options.clientVisibility(clientId, state);
      const clientPatch: Patch = [];

      this.visibilities.set(clientId, nextVisibility);

      if (!this.hasBeenGivenFullState.has(clientId)) {
        const clientState = deriveClientState(state, nextVisibility);
        clientPatch.push(...createFullStatePatch(clientState));
        this.hasBeenGivenFullState.add(clientId);
      }

      // Emulate adds and removals of entities due to visibility changes

      for (const entityName in state) {
        const prevIds = prevVisibility[entityName];
        const nextIds = nextVisibility[entityName];

        for (const addedId of nextIds.difference(prevIds)) {
          clientPatch.push([
            PatchType.Set,
            [entityName, addedId] as PatchPath,
            state[entityName][addedId],
          ]);
        }

        for (const removedId of prevIds.difference(nextIds)) {
          clientPatch.push([
            PatchType.Remove,
            [entityName, removedId] as PatchPath,
          ]);
        }
      }

      // Select the patches visible to the client

      clientPatch.push(
        ...serverPatch.filter(([type, [entityName, entityId]]) => {
          return entityId === undefined
            ? false
            : nextVisibility[entityName].has(entityId as never);
        }),
      );

      if (clientPatch.length > 0) {
        clientPatches.set(clientId, dedupePatch(clientPatch));
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

  private patchCollectors = new Set<State>();

  private *flushPatchCollectors(): Generator<Operation> {
    for (const state of this.patchCollectors) {
      for (const [entityName, entities] of Object.entries(state)) {
        if (isPatchCollectorRecord(entities)) {
          for (const operation of entities.$flush()) {
            yield prefixOperation(entityName, operation);
          }
        }
      }
    }
  }

  attachPatchCollectors(collectors: State): () => void {
    this.patchCollectors.add(collectors);
    return () => this.patchCollectors.delete(collectors);
  }

  markToResendFullState(...clientIds: ClientId[]) {
    for (const clientId of clientIds) {
      this.hasBeenGivenFullState.delete(clientId);
    }
  }

  addEvent<EventName extends keyof EventMap>(
    eventName: EventName,
    payload: EventMap[EventName],
    visibility?: {
      [EntityName in keyof State]: Iterable<inferEntityId<State[EntityName]>>;
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

function deriveClientState<State extends PatchableState>(
  state: State,
  visibilities: ClientVisibility<State>,
): State {
  return Object.fromEntries(
    Object.entries(visibilities).map(
      ([entityName, entityIds]: [string, ReadonlySet<string>]) => {
        const allEntities = state[entityName];
        const referencedEntities = Object.fromEntries(
          entityIds.values().map((id) => [id, allEntities[id]]),
        );
        return [entityName, referencedEntities];
      },
    ),
  ) as State;
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

function createFullStatePatch<State extends PatchableState>(
  state: State,
): Patch {
  const patch: Patch = [];
  for (const key in state) {
    patch.push([PatchType.Set, [key], state[key as keyof typeof state]]);
  }
  return patch;
}

export interface FlushResult {
  clientPatches: ClientPatches;
  clientEvents: ClientEvents;
}

export interface ServerSyncEvent<State extends PatchableState> {
  event: SyncEvent;
  /**
   * If specified, this event will only be sent to clients that have the specified visibility.
   */
  visibility?: ClientVisibility<State>;
}

export interface SyncEmitterOptions<State extends PatchableState> {
  clientVisibility: ClientVisibilityFactory<State>;
  clientIds: () => Iterable<ClientId>;
}

export type ClientVisibilityFactory<State extends PatchableState> = (
  clientId: ClientId,
  state: State,
) => ClientVisibility<State>;

export type ClientPatches = Map<ClientId, Patch>;

export type ClientEvents = Map<ClientId, SyncEvent[]>;

export type ClientVisibility<State extends PatchableState> = {
  [EntityName in keyof State]: ReadonlySet<inferEntityId<State[EntityName]>>;
};

export type PatchableEntityId = string;

export type PatchableEntities<
  Id extends PatchableEntityId = PatchableEntityId,
  Entity = unknown,
> = Record<Id, Entity>;

export type inferEntityId<Entities extends PatchableEntities> =
  Entities extends PatchableEntities<infer Id> ? Id : never;

export type inferEntityValue<Entities extends PatchableEntities> =
  Entities extends PatchableEntities<infer Id, infer Entity> ? Entity : never;

export type PatchableState = { [entityName: string]: PatchableEntities };

export type ClientId = Registry extends { clientId: infer T } ? T : string;

/**
 * Designed to be augmented by the consumer package to conveniently override the type of ClientId.
 * This avoids the need to pollute the generic parameters in all places where ClientId is used.
 */
export interface Registry {}
