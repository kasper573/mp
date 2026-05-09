import { createContext } from "preact";
import { useContext, useMemo } from "preact/hooks";
import type { EntityId } from "@rift/core";
import type { InferValue, RiftType } from "@rift/types";
import type { ReactiveWorld } from "./index";

export const RiftContext = createContext<ReactiveWorld | undefined>(undefined);

function useReactive(): ReactiveWorld {
  const r = useContext(RiftContext);
  if (!r) {
    throw new Error("RiftContext is not provided");
  }
  return r;
}

export function useEntity<const T extends readonly RiftType[]>(
  id: EntityId | undefined,
  ...types: T
): { [K in keyof T]: InferValue<T[K]> | undefined } {
  const r = useReactive();
  const sig = useMemo(
    () => r.entitySignal(id, ...types),
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- variadic deps
    [r, id, ...types],
  );
  return sig.value;
}

export function useEntities<const T extends readonly RiftType[]>(
  ...types: T
): readonly (readonly [EntityId, ...{ [K in keyof T]: InferValue<T[K]> }])[] {
  const r = useReactive();
  const sig = useMemo(
    () => r.entitiesSignal(...types),
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- variadic deps
    [r, ...types],
  );
  return sig.value;
}

export function useFind<const T extends readonly RiftType[]>(
  predicate: (
    id: EntityId,
    ...vs: { [K in keyof T]: InferValue<T[K]> }
  ) => boolean,
  ...types: T
): readonly [EntityId, ...{ [K in keyof T]: InferValue<T[K]> }] | undefined {
  const r = useReactive();
  const sig = useMemo(
    () => r.querySignal(predicate, ...types),
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- variadic deps
    [r, predicate, ...types],
  );
  return sig.value;
}
