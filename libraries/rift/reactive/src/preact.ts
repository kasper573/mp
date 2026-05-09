import { createContext } from "preact";
import { useContext, useMemo } from "preact/hooks";
import type { EntityId } from "@rift/core";
import type { InferValue, RiftType } from "@rift/types";
import type { ReactiveWorld } from "@rift/core";

export const RiftContext = createContext<ReactiveWorld | undefined>(undefined);

function useReactive(): ReactiveWorld {
  const r = useContext(RiftContext);
  if (!r) {
    throw new Error("RiftContext is not provided");
  }
  return r;
}

/**
 * Read N components from a single entity. Returns a tuple of values
 * (each `T | undefined`). Re-renders when any of the listed component
 * types change for this entity, or when membership changes.
 */
export function useEntity<const T extends readonly RiftType[]>(
  id: EntityId | undefined,
  ...types: T
): { [K in keyof T]: InferValue<T[K]> | undefined } {
  const r = useReactive();
  const sig = useMemo(
    () => r.entity(id, ...types),
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- variadic deps
    [r, id, ...types],
  );
  return sig.value;
}

/**
 * Read all entities matching the given component types. Returns an
 * array of `[id, ...values]` rows. Re-renders when entity membership in
 * the query changes or any listed component type changes.
 */
export function useEntities<const T extends readonly RiftType[]>(
  ...types: T
): readonly (readonly [EntityId, ...{ [K in keyof T]: InferValue<T[K]> }])[] {
  const r = useReactive();
  const sig = useMemo(
    () => r.entities(...types),
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- variadic deps
    [r, ...types],
  );
  return sig.value;
}

/**
 * Find the first entity matching the given component types whose row
 * satisfies the predicate. Returns the row, or undefined.
 */
export function useFind<const T extends readonly RiftType[]>(
  predicate: (
    id: EntityId,
    ...vs: { [K in keyof T]: InferValue<T[K]> }
  ) => boolean,
  ...types: T
): readonly [EntityId, ...{ [K in keyof T]: InferValue<T[K]> }] | undefined {
  const r = useReactive();
  const sig = useMemo(
    () => r.find(predicate, ...types),
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- variadic deps
    [r, predicate, ...types],
  );
  return sig.value;
}
