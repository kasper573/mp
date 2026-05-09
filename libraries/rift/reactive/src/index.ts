import {
  computed,
  signal,
  type ReadonlySignal,
  type Signal,
} from "@preact/signals-core";
import { type EntityId, type RiftSchema, World } from "@rift/core";
import type { InferValue, RiftType } from "@rift/types";

type Values<T extends readonly RiftType[]> = {
  [K in keyof T]: InferValue<T[K]> | undefined;
};

type Row<T extends readonly RiftType[]> = readonly [
  EntityId,
  ...{ [K in keyof T]: InferValue<T[K]> },
];

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

  entitySignal<const T extends readonly RiftType[]>(
    id: EntityId | undefined,
    ...types: T
  ): ReadonlySignal<Values<T>> {
    return computed((): Values<T> => {
      for (const t of types) {
        void this.#poolVersion(t).value;
      }
      if (id === undefined) {
        return types.map(() => undefined) as unknown as Values<T>;
      }
      return types.map((t) => this.get(id, t)) as unknown as Values<T>;
    });
  }

  entitiesSignal<const T extends readonly RiftType[]>(
    ...types: T
  ): ReadonlySignal<readonly Row<T>[]> {
    return computed((): readonly Row<T>[] => {
      void this.#structureVersion.value;
      for (const t of types) {
        void this.#poolVersion(t).value;
      }
      return this.query(...types).toArray() as unknown as readonly Row<T>[];
    });
  }

  querySignal<const T extends readonly RiftType[]>(
    predicate: (
      id: EntityId,
      ...vs: { [K in keyof T]: InferValue<T[K]> }
    ) => boolean,
    ...types: T
  ): ReadonlySignal<Row<T> | undefined> {
    return computed((): Row<T> | undefined => {
      void this.#structureVersion.value;
      for (const t of types) {
        void this.#poolVersion(t).value;
      }
      for (const row of this.query(...types)) {
        const [eid, ...rest] = row;
        if (predicate(eid, ...(rest as { [K in keyof T]: InferValue<T[K]> }))) {
          return row as unknown as Row<T>;
        }
      }
      return undefined;
    });
  }
}

function bump(s: Signal<number>): void {
  s.value = s.peek() + 1;
}
