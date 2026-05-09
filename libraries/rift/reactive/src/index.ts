import {
  computed,
  signal,
  type ReadonlySignal,
  type Signal,
} from "@preact/signals-core";
import {
  ComponentAdded,
  ComponentChanged,
  ComponentRemoved,
  EntityCreated,
  EntityDestroyed,
  type EntityId,
  type ReactiveWorld,
  type World,
} from "@rift/core";
import type { InferValue, RiftType } from "@rift/types";

type Values<T extends readonly RiftType[]> = {
  [K in keyof T]: InferValue<T[K]> | undefined;
};

type Row<T extends readonly RiftType[]> = readonly [
  EntityId,
  ...{ [K in keyof T]: InferValue<T[K]> },
];

/**
 * Attach a reactive layer over the given world. The returned
 * `ReactiveWorld` exposes signal-shaped views that re-evaluate when the
 * underlying world emits the relevant change events.
 *
 * Intended for client-side UI integration. Server code does not need this.
 */
export function attachReactive(world: World): ReactiveWorld {
  const structureVersion = signal(0);
  const poolVersions = new Map<RiftType, Signal<number>>();

  function poolVersion(type: RiftType): Signal<number> {
    let v = poolVersions.get(type);
    if (!v) {
      v = signal(0);
      poolVersions.set(type, v);
    }
    return v;
  }

  function bump(s: Signal<number>): void {
    s.value = s.peek() + 1;
  }

  world.on(EntityCreated, () => bump(structureVersion));
  world.on(EntityDestroyed, () => bump(structureVersion));
  world.on(ComponentAdded, ({ type }) => {
    bump(structureVersion);
    bump(poolVersion(type));
  });
  world.on(ComponentRemoved, ({ type }) => {
    bump(structureVersion);
    bump(poolVersion(type));
  });
  world.on(ComponentChanged, ({ type }) => bump(poolVersion(type)));

  return {
    world,

    entity<const T extends readonly RiftType[]>(
      id: EntityId | undefined,
      ...types: T
    ): ReadonlySignal<Values<T>> {
      return computed((): Values<T> => {
        for (const t of types) {
          // subscribe to relevant version signal
          void poolVersion(t).value;
        }
        if (id === undefined) {
          return types.map(() => undefined) as unknown as Values<T>;
        }
        return types.map((t) => world.get(id, t)) as unknown as Values<T>;
      });
    },

    entities<const T extends readonly RiftType[]>(
      ...types: T
    ): ReadonlySignal<readonly Row<T>[]> {
      return computed((): readonly Row<T>[] => {
        void structureVersion.value;
        for (const t of types) {
          void poolVersion(t).value;
        }
        return world.query(...types).toArray() as unknown as readonly Row<T>[];
      });
    },

    find<const T extends readonly RiftType[]>(
      predicate: (
        id: EntityId,
        ...vs: { [K in keyof T]: InferValue<T[K]> }
      ) => boolean,
      ...types: T
    ): ReadonlySignal<Row<T> | undefined> {
      return computed((): Row<T> | undefined => {
        void structureVersion.value;
        for (const t of types) {
          void poolVersion(t).value;
        }
        for (const row of world.query(...types)) {
          const [eid, ...rest] = row;
          if (
            predicate(eid, ...(rest as { [K in keyof T]: InferValue<T[K]> }))
          ) {
            return row as unknown as Row<T>;
          }
        }
        return undefined;
      });
    },
  };
}
