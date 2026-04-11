import { useContext, useMemo } from "preact/hooks";
import { useComputed } from "@mp/state/react";
import type { ReadonlySignal } from "@mp/state";
import type { Entity, RiftType, Infer } from "@rift/core";
import { PreactRendererContext } from "./context";

export function useRendererContext() {
  const ctx = useContext(PreactRendererContext);
  if (!ctx) {
    throw new Error(
      "PreactRendererContext is not provided. Wrap UI in PreactRendererModule.mount.",
    );
  }
  return ctx;
}

export function useLocalCharacterEntity(): ReadonlySignal<Entity | undefined> {
  const ctx = useRendererContext();
  return useComputed(() => {
    const id = ctx.localCharacterEntityId.value;
    return id === undefined ? undefined : ctx.rift.entity(id);
  });
}

export function useEntityComponent<T extends RiftType>(
  entity: ReadonlySignal<Entity | undefined>,
  type: T,
): ReadonlySignal<Infer<T> | undefined> {
  return useComputed(() => {
    const e = entity.value;
    return e?.has(type) ? (e.get(type) as Infer<T>) : undefined;
  });
}

export function useRiftQuery(...types: RiftType[]): ReadonlySignal<Entity[]> {
  const ctx = useRendererContext();
  const query = useMemo(
    () => ctx.rift.query(...types),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ctx.rift, ...types],
  );
  return query;
}
