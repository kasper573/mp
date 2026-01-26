import {
  createMemo,
  createSignal,
  createEffect,
  type Accessor,
} from "solid-js";
import type { MapChanges } from "../shared/map-changes";
import { applyMapChanges } from "../shared/map-changes";
import type { SubscriptionResult } from "./use-subscription";

/**
 * SolidJS hook that integrates a GraphQL subscription with our `MapChanges` type convention.
 * Maintains a local Map instance that is updated based on incoming map changes.
 */
export function useMapSubscription<Data, Key, Value>(
  sub: SubscriptionResult<Data>,
  selectChanges: (data: Data) => MapChanges<Key, Value>,
): Accessor<ReadonlyMap<Key, Value>> {
  const changes = createMemo(() => {
    const data = sub.data();
    return data ? selectChanges(data) : null;
  });

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
