import { Computed, type ReadonlySignal } from "@preact/signals-core";
import type { Entity, EntityId } from "./entity";
import type { RiftType } from "./types";

export interface QueryChangeEvent {
  type: "added" | "removed";
  entity: Entity;
}

type ChangeListener = (event: QueryChangeEvent) => void;

export class RiftQuery extends Computed<Entity[]> {
  readonly #listeners = new Set<ChangeListener>();
  readonly componentTypes: ReadonlyArray<RiftType>;
  #previous = new Set<Entity>();

  constructor(
    componentTypes: RiftType[],
    version: ReadonlySignal<number>,
    entities: Map<EntityId, Entity>,
  ) {
    super(() => {
      void version.value;
      const result: Entity[] = [];
      for (const entity of entities.values()) {
        if (this.#matches(entity)) {
          result.push(entity);
        }
      }

      const current = new Set(result);
      for (const entity of current) {
        if (!this.#previous.has(entity)) {
          for (const l of this.#listeners) {
            l({ type: "added", entity });
          }
        }
      }
      for (const entity of this.#previous) {
        if (!current.has(entity)) {
          for (const l of this.#listeners) {
            l({ type: "removed", entity });
          }
        }
      }
      this.#previous = current;

      return result;
    });
    this.componentTypes = componentTypes;
  }

  onChange(listener: ChangeListener): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  #matches(entity: Entity): boolean {
    for (const type of this.componentTypes) {
      if (!entity.has(type)) {
        return false;
      }
    }
    return true;
  }
}
