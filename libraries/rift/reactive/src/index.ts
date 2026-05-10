import {
  computed,
  signal,
  type ReadonlySignal,
  type Signal,
} from "@preact/signals-core";
import {
  type EntityId,
  type QueryRow,
  type RiftSchema,
  World,
} from "@rift/core";
import type { InferValue, RiftType } from "@rift/types";

type Values<T extends readonly RiftType[]> = {
  [K in keyof T]: InferValue<T[K]> | undefined;
};

export class ReactiveWorld extends World {
  readonly #structureVersion = signal(0);
  readonly #poolVersions = new Map<RiftType, Signal<number>>();

  constructor(schema: RiftSchema) {
    super(schema);
    this.on((event) => {
      switch (event.type) {
        case "entityCreated":
        case "entityDestroyed":
          bump(this.#structureVersion);
          return;
        case "componentAdded":
        case "componentRemoved":
          bump(this.#structureVersion);
          bump(this.#poolVersion(event.component));
          return;
        case "componentChanged":
          bump(this.#poolVersion(event.component));
          return;
      }
    });
  }

  #poolVersion(type: RiftType): Signal<number> {
    let v = this.#poolVersions.get(type);
    if (!v) {
      v = signal(0);
      this.#poolVersions.set(type, v);
    }
    return v;
  }

  trackPool(type: RiftType): void {
    void this.#poolVersion(type).value;
  }

  trackStructure(): void {
    void this.#structureVersion.value;
  }

  entitySignal<const T extends readonly RiftType[]>(
    id: EntityId | undefined,
    ...types: T
  ): ReadonlySignal<Values<T>> {
    return computed((): Values<T> => {
      for (const t of types) {
        void this.#poolVersion(t).value;
      }
      const result = types.map((t) =>
        id === undefined ? undefined : this.get(id, t),
      );
      return result as Values<T>;
    });
  }

  entitiesSignal<const T extends readonly RiftType[]>(
    ...types: T
  ): ReadonlySignal<readonly QueryRow<T>[]> {
    return computed((): readonly QueryRow<T>[] => {
      void this.#structureVersion.value;
      for (const t of types) {
        void this.#poolVersion(t).value;
      }
      return this.query(...types).toArray();
    });
  }

  // Like entitiesSignal but only fires on membership changes — values can
  // mutate freely without triggering this signal. Useful for reactive
  // collection bindings that key on EntityId.
  entityIdsSignal(...types: readonly RiftType[]): ReadonlySignal<EntityId[]> {
    return computed((): EntityId[] => {
      void this.#structureVersion.value;
      const ids: EntityId[] = [];
      for (const [id] of this.query(...types)) ids.push(id);
      return ids;
    });
  }

  querySignal<const T extends readonly RiftType[]>(
    predicate: (
      id: EntityId,
      ...vs: { [K in keyof T]: InferValue<T[K]> }
    ) => boolean,
    ...types: T
  ): ReadonlySignal<QueryRow<T> | undefined> {
    return computed((): QueryRow<T> | undefined => {
      void this.#structureVersion.value;
      for (const t of types) {
        void this.#poolVersion(t).value;
      }
      for (const row of this.query(...types)) {
        const [eid, ...rest] = row;
        if (predicate(eid, ...(rest as { [K in keyof T]: InferValue<T[K]> }))) {
          return row;
        }
      }
      return undefined;
    });
  }
}

function bump(s: Signal<number>): void {
  s.value = s.peek() + 1;
}
