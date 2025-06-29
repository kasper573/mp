import type { SyncEntity, SyncMap } from "@mp/sync";
import type { Accessor } from "solid-js";
import { createEffect, createMemo, createSignal, onCleanup } from "solid-js";
import { createMutable } from "solid-js/store";

/**
 * solid-js integration for SyncEntity.
 */
export function useSyncEntity<const T extends SyncEntity>(
  entity: Accessor<T> | T,
): T {
  const getEntity = typeof entity === "function" ? entity : () => entity;
  const snapshot = createMutable<T>(getEntity().snapshot() as T);

  createEffect(() => {
    onCleanup(
      getEntity().subscribe((changes) => {
        Object.assign(snapshot, changes);
      }),
    );
  });

  return snapshot;
}

/**
 * solid-js integration for SyncMap.
 */
export function useSyncMap<K extends string, V>(
  syncMap: Accessor<SyncMap<K, V>>,
): Accessor<ReadonlyMap<K, V>> {
  const [keys, setKeys] = createSignal<K[]>(syncMap().keys().toArray());

  createEffect(() => {
    onCleanup(
      syncMap().subscribe(() => {
        setKeys(syncMap().keys().toArray());
      }),
    );
  });

  const map = createMemo(() => {
    return new Map(keys().map((key) => [key, syncMap().get(key)] as [K, V]));
  });

  return map;
}
