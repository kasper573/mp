import type { RiftType, InferValue } from "@rift/types";
import type { RiftServer } from "./server";
import type { RiftClient } from "./client";
import type { World } from "./world";
import type { EntityId } from "./protocol";

export type Cleanup = () => void | Promise<void>;

export interface Module {
  stop(): void | Promise<void>;
}

// A feature's setup callback may return:
// - a `Cleanup` function (typical for setup-and-subscribe modules),
// - a `Module` instance (for class-shaped modules with internal state),
// - or nothing (for setups whose only effect is registering hooks/signals
//   that don't need teardown beyond the lifetime of the host).
// oxlint-disable-next-line typescript/no-invalid-void-type -- void is the natural type for a callback that returns nothing
export type SetupReturn = Module | Cleanup | void;

export interface Feature {
  readonly components?: readonly RiftType[];
  readonly events?: readonly RiftType[];
  readonly server?: (server: RiftServer) => SetupReturn | Promise<SetupReturn>;
  readonly client?: (
    client: RiftClient,
    reactive: ReactiveWorld,
  ) => SetupReturn | Promise<SetupReturn>;
}

export function defineFeature(f: Feature): Feature {
  return f;
}

export function normalizeCleanup(r: SetupReturn): Cleanup | undefined {
  if (!r) return undefined;
  return typeof r === "function" ? r : (): void | Promise<void> => r.stop();
}

// Structural shape of a reactive value-source. Matches `ReadonlySignal<T>`
// from `@preact/signals-core` without requiring `@rift/core` to depend on
// it, so the server side stays free of signal-library imports.
export interface ValueSignal<T> {
  readonly value: T;
}

type EntityValues<T extends readonly RiftType[]> = {
  [K in keyof T]: InferValue<T[K]> | undefined;
};

type EntityRow<T extends readonly RiftType[]> = readonly [
  EntityId,
  ...{ [K in keyof T]: InferValue<T[K]> },
];

/**
 * Forward-declared interface for the client-side reactive layer. Concrete
 * implementation lives in `@rift/reactive`. The interface is here so
 * `Feature.client` can reference it without `@rift/core` depending on the
 * reactive package.
 */
export interface ReactiveWorld {
  readonly world: World;

  entity<const T extends readonly RiftType[]>(
    id: EntityId | undefined,
    ...types: T
  ): ValueSignal<EntityValues<T>>;

  entities<const T extends readonly RiftType[]>(
    ...types: T
  ): ValueSignal<readonly EntityRow<T>[]>;

  find<const T extends readonly RiftType[]>(
    predicate: (
      id: EntityId,
      ...vs: { [K in keyof T]: InferValue<T[K]> }
    ) => boolean,
    ...types: T
  ): ValueSignal<EntityRow<T> | undefined>;
}
