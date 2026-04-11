import { signal } from "@preact/signals-core";
import { ReadBuffer, WriteBuffer } from "./buffer";
import { Entity, type EntityId } from "./entity";
import type { UnsubscribeFn } from "./event-bus";
import { EventBus } from "./event-bus";
import { RiftQuery } from "./query";
import type { Infer, RiftEventBusMap } from "./types";
import { type RiftType, isTagType } from "./types";
import type { RiftWorld } from "./world";
import {
  OP_SPAWN,
  OP_UPDATE,
  OP_DESTROY,
  OP_EVENT,
  OP_COMPONENT_REMOVE,
} from "./internal";

export class RiftClient {
  readonly #world: RiftWorld;
  readonly #entities = new Map<EntityId, Entity>();
  readonly #eventHandlers: RiftEventBusMap = new Map();
  readonly #structureVersion = signal(0);
  #seq = 0;

  lastServerTick = 0;
  lastAckedSeq = 0;

  constructor(world: RiftWorld) {
    this.#world = world;
  }

  entity(id: EntityId): Entity | undefined {
    return this.#entities.get(id);
  }

  query(...types: RiftType[]): RiftQuery {
    return new RiftQuery(types, this.#structureVersion, this.#entities);
  }

  on<T extends RiftType>(
    type: T,
    handler: (data: Infer<T>) => void,
  ): UnsubscribeFn {
    let bus = this.#eventHandlers.get(type);
    if (!bus) {
      bus = new EventBus();
      this.#eventHandlers.set(type, bus);
    }
    return bus.subscribe(handler);
  }

  emit<T extends RiftType>(type: T, value: Infer<T>): Uint8Array {
    this.#seq++;
    const w = new WriteBuffer();
    w.writeU32(this.#seq);
    w.writeU16(this.#world.getEventId(type));
    if (!isTagType(type)) {
      type.write(w, value);
    }
    return w.toUint8Array().slice();
  }

  apply(packet: Uint8Array): void {
    const r = new ReadBuffer(packet);
    this.lastServerTick = r.readU32();
    this.lastAckedSeq = r.readU32();

    while (r.remaining > 0) {
      const op = r.readU8();
      switch (op) {
        case OP_SPAWN:
          this.#applySpawn(r);
          break;
        case OP_UPDATE:
          this.#applyUpdate(r);
          break;
        case OP_DESTROY:
          this.#applyDestroy(r);
          break;
        case OP_EVENT:
          this.#applyEvent(r);
          break;
        case OP_COMPONENT_REMOVE:
          this.#applyComponentRemove(r);
          break;
        default:
          throw new Error(`Unknown opcode: ${op}`);
      }
    }
  }

  #applySpawn(r: ReadBuffer): void {
    const entityId = r.readU32();
    const count = r.readU8();

    let entity = this.#entities.get(entityId);
    if (!entity) {
      entity = new Entity(entityId);
      this.#entities.set(entityId, entity);
    }

    for (let i = 0; i < count; i++) {
      const typeId = r.readU16();
      const type = this.#world.getComponentType(typeId);
      const value = isTagType(type) ? undefined : type.read(r);
      entity.set(type, value);
    }

    this.#structureVersion.value++;
  }

  #applyUpdate(r: ReadBuffer): void {
    const entityId = r.readU32();
    const count = r.readU8();
    const entity = this.#entities.get(entityId);

    if (!entity) {
      for (let i = 0; i < count; i++) {
        const typeId = r.readU16();
        const type = this.#world.getComponentType(typeId);
        if (!isTagType(type)) {
          type.read(r);
        }
      }
      return;
    }

    let structureChanged = false;
    for (let i = 0; i < count; i++) {
      const typeId = r.readU16();
      const type = this.#world.getComponentType(typeId);
      const value = isTagType(type) ? undefined : type.read(r);

      if (!entity.has(type)) {
        structureChanged = true;
      }
      entity.set(type, value);
    }

    if (structureChanged) {
      this.#structureVersion.value++;
    }
  }

  #applyDestroy(r: ReadBuffer): void {
    const entityId = r.readU32();
    if (this.#entities.delete(entityId)) {
      this.#structureVersion.value++;
    }
  }

  #applyEvent(r: ReadBuffer): void {
    const typeId = r.readU16();
    const type = this.#world.getEventType(typeId);
    const value = isTagType(type) ? undefined : type.read(r);

    this.#eventHandlers.get(type)?.emit(value);
  }

  #applyComponentRemove(r: ReadBuffer): void {
    const entityId = r.readU32();
    const typeId = r.readU16();
    const type = this.#world.getComponentType(typeId);
    const entity = this.#entities.get(entityId);
    if (entity) {
      entity.remove(type);
      this.#structureVersion.value++;
    }
  }
}
