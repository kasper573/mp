import { createMemo, createSignal, createEffect } from "solid-js";
import type { MapChanges } from "../shared/map-changes";
import { applyMapChanges } from "../shared/map-changes";
import type { UseSubscriptionResult } from "./solid";

/**
 * SolidJS hook that integrates a GraphQL subscription with our `MapChanges` type convention.
 * Maintains a local Map instance that is updated based on incoming map changes.
 * Returns a signal accessor function that gives the current map state.
 */
export function useMapSubscription<Data, Key, Value>(
  sub: UseSubscriptionResult<Data>,
  selectChanges: (data: Data) => MapChanges<Key, Value>,
): () => ReadonlyMap<Key, Value> {
  const changes = createMemo(() => (sub.data ? selectChanges(sub.data) : null));

  return useMapChanges(changes);
}

function useMapChanges<Key, Value>(
  mapChanges: () => MapChanges<Key, Value> | null,
  initialMap = emptyMap<Key, Value>,
): () => ReadonlyMap<Key, Value> {
  const [map, setMap] = createSignal<ReadonlyMap<Key, Value>>(initialMap());

  createEffect(() => {
    const changes = mapChanges();
    if (changes) {
      setMap((prev) => applyMapChanges(prev, changes));
    }
  });

  return map;
}

function emptyMap<Key, Value>(): ReadonlyMap<Key, Value> {
  return new Map<Key, Value>();
}
