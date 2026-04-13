import { signal } from "@preact/signals-core";
import { ReadBuffer, WriteBuffer } from "./buffer";
import { Entity, type EntityId } from "./entity";
import type { UnsubscribeFn } from "./event-bus";
import { EventBus } from "./event-bus";
import { onChange, onDirty } from "./internal";
import { RiftQuery } from "./query";
import type { Infer, RiftEventBusMap } from "./types";
import { type RiftType, isTagType, isStructType } from "./types";
import type { RiftWorld, TypeId } from "./world";
import {
  PendingEventBuilder,
  type PendingEvent,
  type RiftScope,
} from "./scope";
import {
  OP_SPAWN,
  OP_UPDATE,
  OP_DESTROY,
  OP_EVENT,
  OP_COMPONENT_REMOVE,
} from "./internal";

export type ClientId = string;

interface ClientState {
  knownEntities: Map<EntityId, Set<TypeId>>;
  lastAckedSeq: number;
}

export class RiftServer {
  readonly #world: RiftWorld;
  #nextEntityId = 1;
  #tick = 0;
  readonly #entities = new Map<EntityId, Entity>();
  readonly #clients = new Map<ClientId, ClientState>();
  readonly #pendingEvents: PendingEvent[] = [];
  readonly #dirtyEntities = new Set<EntityId>();
  readonly #destroyedEntities = new Set<EntityId>();
  readonly #removedComponents = new Map<EntityId, Set<TypeId>>();
  readonly #addedComponents = new Map<EntityId, Set<TypeId>>();
  #scope: RiftScope = defaultScope;
  readonly #flushIntervals = new Map<
    RiftType,
    { interval: number; counter: number }
  >();
  readonly #eventHandlers: RiftEventBusMap<[clientId: ClientId]> = new Map();
  readonly #structureVersion = signal(0);

  constructor(world: RiftWorld) {
    this.#world = world;
  }

  spawn(): Entity {
    const id = this.#nextEntityId++;
    const entity = new Entity(id);
    this.#entities.set(id, entity);
    this.#wireEntity(entity);
    this.#structureVersion.value++;
    return entity;
  }

  destroy(entity: Entity): void {
    this.#entities.delete(entity.id);
    this.#destroyedEntities.add(entity.id);
    this.#dirtyEntities.delete(entity.id);
    this.#structureVersion.value++;
  }

  entity(id: EntityId): Entity | undefined {
    return this.#entities.get(id);
  }

  query(...types: RiftType[]): RiftQuery {
    return new RiftQuery(types, this.#structureVersion, this.#entities);
  }

  addClient(clientId: ClientId): void {
    this.#clients.set(clientId, {
      knownEntities: new Map(),
      lastAckedSeq: 0,
    });
  }

  removeClient(clientId: ClientId): void {
    this.#clients.delete(clientId);
  }

  setScope(config: Partial<RiftScope>): void {
    this.#scope = {
      ...defaultScope,
      ...config,
    };
  }

  emit<T extends RiftType>(type: T, value: Infer<T>): PendingEventBuilder<T> {
    return new PendingEventBuilder(this.#pendingEvents, type, value);
  }

  on<T extends RiftType>(
    type: T,
    handler: (clientId: ClientId, data: Infer<T>) => void,
  ): UnsubscribeFn {
    let bus = this.#eventHandlers.get(type);
    if (!bus) {
      bus = new EventBus();
      this.#eventHandlers.set(type, bus);
    }
    return bus.subscribe(handler);
  }

  handleClientEvent(clientId: ClientId, buf: Uint8Array): void {
    const r = new ReadBuffer(buf);
    const seq = r.readU32();
    const typeId = r.readU16();
    const type = this.#world.getEventType(typeId);
    const value = isTagType(type) ? undefined : type.read(r);

    const client = this.#clients.get(clientId);
    if (client && seq > client.lastAckedSeq) {
      client.lastAckedSeq = seq;
    }

    this.#eventHandlers.get(type)?.emit(clientId, value);
  }

  setFlushInterval(type: RiftType, interval: number): void {
    if (interval <= 1) {
      this.#flushIntervals.delete(type);
    } else {
      this.#flushIntervals.set(type, { interval, counter: 0 });
    }
  }

  tick(): void {
    this.#tick++;
  }

  flush(): Map<ClientId, Uint8Array | undefined> {
    for (const state of this.#flushIntervals.values()) {
      state.counter++;
    }

    const result = new Map<ClientId, Uint8Array | undefined>();
    for (const [clientId, clientState] of this.#clients) {
      result.set(clientId, this.#buildPacket(clientId, clientState));
    }

    for (const entityId of this.#dirtyEntities) {
      const entity = this.#entities.get(entityId);
      if (!entity) {
        continue;
      }
      for (const [type, store] of entity.components) {
        if (!this.#isThrottled(type)) {
          store.dirty = false;
          store.dirtyFields = 0;
        }
      }
    }
    this.#dirtyEntities.clear();
    this.#destroyedEntities.clear();
    this.#removedComponents.clear();
    this.#addedComponents.clear();
    this.#pendingEvents.length = 0;

    return result;
  }

  #wireEntity(entity: Entity): void {
    entity[onDirty] = (e) => {
      this.#dirtyEntities.add(e.id);
    };

    entity[onChange] = (e, type, action) => {
      this.#dirtyEntities.add(e.id);
      const typeId = this.#world.getComponentId(type);
      const map =
        action === "add" ? this.#addedComponents : this.#removedComponents;
      let set = map.get(e.id);
      if (!set) {
        set = new Set();
        map.set(e.id, set);
      }
      set.add(typeId);
      this.#structureVersion.value++;
    };
  }

  #isThrottled(type: RiftType): boolean {
    const state = this.#flushIntervals.get(type);
    if (!state) {
      return false;
    }
    if (state.counter >= state.interval) {
      state.counter = 0;
      return false;
    }
    return true;
  }

  #writeSpawn(
    w: WriteBuffer,
    entityId: EntityId,
    entity: Entity,
    visibleTypes: RiftType[],
    clientState: ClientState,
  ): boolean {
    if (visibleTypes.length === 0) {
      return false;
    }
    w.writeU8(OP_SPAWN);
    w.writeU32(entityId);
    w.writeU8(visibleTypes.length);
    for (const type of visibleTypes) {
      w.writeU16(this.#world.getComponentId(type));
      if (!isTagType(type)) {
        type.write(w, entity.get(type));
      }
    }
    clientState.knownEntities.set(
      entityId,
      new Set(visibleTypes.map((t) => this.#world.getComponentId(t))),
    );
    return true;
  }

  #writeComponentRemoves(
    w: WriteBuffer,
    entityId: EntityId,
    known: Set<TypeId>,
    visibleTypeIds: Set<TypeId>,
  ): boolean {
    let wrote = false;

    for (const knownTypeId of known) {
      if (!visibleTypeIds.has(knownTypeId)) {
        w.writeU8(OP_COMPONENT_REMOVE);
        w.writeU32(entityId);
        w.writeU16(knownTypeId);
        known.delete(knownTypeId);
        wrote = true;
      }
    }

    const removed = this.#removedComponents.get(entityId);
    if (removed) {
      for (const typeId of removed) {
        if (known.has(typeId)) {
          w.writeU8(OP_COMPONENT_REMOVE);
          w.writeU32(entityId);
          w.writeU16(typeId);
          known.delete(typeId);
          wrote = true;
        }
      }
    }

    return wrote;
  }

  #writeEntityUpdates(
    w: WriteBuffer,
    entityId: EntityId,
    entity: Entity,
    visibleTypes: RiftType[],
    known: Set<TypeId>,
  ): boolean {
    if (
      !this.#dirtyEntities.has(entityId) &&
      !this.#addedComponents.has(entityId)
    ) {
      return false;
    }

    w.writeU8(OP_UPDATE);
    w.writeU32(entityId);
    const countOffset = w.offset;
    w.writeU8(0);
    let updateCount = 0;

    for (const type of visibleTypes) {
      const typeId = this.#world.getComponentId(type);
      if (this.#isThrottled(type)) {
        continue;
      }

      if (!known.has(typeId)) {
        known.add(typeId);
        updateCount++;
        w.writeU16(typeId);
        if (!isTagType(type)) {
          type.write(w, entity.get(type));
        }
      } else {
        const store = entity.components.get(type);
        if (store?.dirty && !isTagType(type)) {
          updateCount++;
          if (
            isStructType(type) &&
            store.dirtyFields !== (1 << type.fields.length) - 1
          ) {
            w.writeU16(typeId | 0x8000);
            type.writeMasked(w, entity.get(type), store.dirtyFields);
          } else {
            w.writeU16(typeId);
            type.write(w, entity.get(type));
          }
        }
      }
    }

    if (updateCount === 0) {
      w.offset = countOffset - 5;
      return false;
    }

    w.writeU8At(countOffset, updateCount);
    return true;
  }

  #buildPacket(
    clientId: ClientId,
    clientState: ClientState,
  ): Uint8Array | undefined {
    const w = new WriteBuffer();
    let hasData = false;

    w.writeU32(this.#tick);
    w.writeU32(clientState.lastAckedSeq);

    const currentlyVisible = new Set<EntityId>();

    for (const [entityId, entity] of this.#entities) {
      const visibleTypes = this.#scope
        .visibleComponents(clientId, entity)
        .filter((t) => entity.has(t));
      if (visibleTypes.length === 0) {
        continue;
      }

      currentlyVisible.add(entityId);
      const known = clientState.knownEntities.get(entityId);

      if (!known) {
        if (this.#writeSpawn(w, entityId, entity, visibleTypes, clientState)) {
          hasData = true;
        }
      } else {
        const visibleTypeIds = new Set(
          visibleTypes.map((t) => this.#world.getComponentId(t)),
        );
        if (this.#writeComponentRemoves(w, entityId, known, visibleTypeIds)) {
          hasData = true;
        }
        if (
          this.#writeEntityUpdates(w, entityId, entity, visibleTypes, known)
        ) {
          hasData = true;
        }
      }
    }

    for (const [knownId] of clientState.knownEntities) {
      if (!currentlyVisible.has(knownId)) {
        w.writeU8(OP_DESTROY);
        w.writeU32(knownId);
        clientState.knownEntities.delete(knownId);
        hasData = true;
      }
    }

    for (const event of this.#pendingEvents) {
      if (event.shouldSendTo(clientId, this.#scope)) {
        const typeId = this.#world.getEventId(event.type);
        w.writeU8(OP_EVENT);
        w.writeU16(typeId);
        if (!isTagType(event.type)) {
          event.type.write(w, event.value);
        }
        hasData = true;
      }
    }

    return hasData ? w.toUint8Array().slice() : undefined;
  }
}

const defaultScope: RiftScope = {
  visibleComponents: (_, entity) => [...entity.components.keys()],
  shouldSendEvent: () => true,
};
