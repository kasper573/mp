import type { Signal } from "@preact/signals-core";
import {
  type RiftType,
  type Infer,
  type RiftStore,
  isStructType,
  isTagType,
  createRiftStore,
} from "./types";
import { onChange, onDirty } from "./internal";

export type EntityId = number;

export type EntityChangeHandler = (
  entity: Entity,
  type: RiftType,
  action: "add" | "remove",
) => void;

export type EntityDirtyHandler = (entity: Entity, type: RiftType) => void;

export class Entity {
  readonly id: EntityId;
  readonly components = new Map<RiftType, RiftStore>();

  // Note: These use package internal symbols to ensure outside consumers do not have access to them.
  // We use property callbacks instead of EventBus since we only need to have one handler active at a time
  [onDirty]?: EntityDirtyHandler;
  [onChange]?: EntityChangeHandler;

  constructor(id: EntityId) {
    this.id = id;
  }

  has(type: RiftType): boolean {
    return this.components.has(type);
  }

  set<T extends RiftType>(
    type: T,

    // Make value param optional when the type says it is
    ...[value]: undefined extends Infer<T>
      ? [value?: Infer<T>]
      : [value: Infer<T>]
  ): void {
    let store = this.components.get(type);
    if (!store) {
      store = createRiftStore(type, value);
      store.dirty = true;
      if (isStructType(type)) {
        store.dirtyFields = (1 << type.fields.length) - 1;
      }
      this.components.set(type, store);
      this[onChange]?.(this, type, "add");
      this[onDirty]?.(this, type);
      return;
    }

    if (isStructType(type) && store.fieldSignals) {
      const v = value as Record<string, unknown>;
      let changed = false;
      for (let i = 0; i < type.fields.length; i++) {
        const f = type.fields[i];
        const fieldSignal = store.fieldSignals.get(f.name);
        if (fieldSignal && !f.type.equals(fieldSignal.value, v[f.name])) {
          fieldSignal.value = v[f.name];
          store.dirtyFields |= 1 << i;
          changed = true;
        }
      }
      if (!changed) return;
    } else if (!isTagType(type) && type.equals(store.signal.value, value)) {
      return;
    }

    store.signal.value = value;
    store.dirty = true;
    this[onDirty]?.(this, type);
  }

  get<T extends RiftType>(type: T): Infer<T> {
    const store = this.components.get(type);
    if (!store) {
      throw new Error(`Entity ${this.id} does not have component`);
    }

    if (isStructType(type) && store.fieldSignals) {
      return type.createProxy(store.fieldSignals, (fieldIndex) => {
        store.dirtyFields |= 1 << fieldIndex;
        store.dirty = true;
        this[onDirty]?.(this, type);
      }) as Infer<T>;
    }

    if (isTagType(type)) {
      return undefined as Infer<T>;
    }

    return store.signal.value as Infer<T>;
  }

  signal<T extends RiftType>(type: T): Signal<Infer<T>> {
    const store = this.components.get(type);
    if (!store) {
      throw new Error(`Entity ${this.id} does not have component`);
    }
    return store.signal as Signal<Infer<T>>;
  }

  remove(type: RiftType): void {
    if (!this.components.delete(type)) {
      return;
    }
    this[onChange]?.(this, type, "remove");
  }
}
