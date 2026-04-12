import type { RiftType } from "./types";

export type TypeId = number;

export class RiftWorld {
  readonly componentTypes: ReadonlyArray<RiftType>;
  readonly eventTypes: ReadonlyArray<RiftType>;

  readonly #componentIdMap = new Map<RiftType, TypeId>();
  readonly #eventIdMap = new Map<RiftType, TypeId>();

  constructor(config: { components: RiftType[]; events?: RiftType[] }) {
    this.componentTypes = config.components;
    this.eventTypes = config.events ?? [];

    for (let i = 0; i < config.components.length; i++) {
      this.#componentIdMap.set(config.components[i], i);
    }
    for (let i = 0; i < this.eventTypes.length; i++) {
      this.#eventIdMap.set(this.eventTypes[i], i);
    }
  }

  getComponentId(type: RiftType): TypeId {
    const id = this.#componentIdMap.get(type);
    if (id === undefined) {
      throw new Error("Component type not registered in world");
    }
    return id;
  }

  getEventId(type: RiftType): TypeId {
    const id = this.#eventIdMap.get(type);
    if (id === undefined) {
      throw new Error("Event type not registered in world");
    }
    return id;
  }

  getComponentType(id: TypeId): RiftType {
    const type = this.componentTypes[id];
    if (!type) {
      throw new Error(`Unknown component type ID: ${id}`);
    }
    return type;
  }

  getEventType(id: TypeId): RiftType {
    const type = this.eventTypes[id];
    if (!type) {
      throw new Error(`Unknown event type ID: ${id}`);
    }
    return type;
  }
}
