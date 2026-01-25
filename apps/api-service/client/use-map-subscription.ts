import type { useSubscription } from "@apollo/client/react";
import { useMemo, useState, useEffect } from "preact/hooks";
import type { MapChanges } from "../shared/map-changes";
import { applyMapChanges } from "../shared/map-changes";

/**
 * React hook that integrates a GraphQL subscription with our `MapChanges` type convention.
 * Maintains a local Map instance that is updated based on incoming map changes.
 */
export function useMapSubscription<Data, Key, Value>(
  sub: useSubscription.Result<Data>,
  selectChanges: (data: Data) => MapChanges<Key, Value>,
): ReadonlyMap<Key, Value> {
  const changes = useMemo(
    () => (sub.data ? selectChanges(sub.data) : null),
    // oxlint-disable-next-line exhaustive-deps
    [sub.data],
  );

  return useMapChanges(changes);
}

function useMapChanges<Key, Value>(
  mapChanges: MapChanges<Key, Value> | null,
  initialMap = emptyMap<Key, Value>,
): ReadonlyMap<Key, Value> {
  const [map, setMap] = useState<ReadonlyMap<Key, Value>>(initialMap);

  useEffect(() => {
    if (mapChanges) {
      setMap((prev) => applyMapChanges(prev, mapChanges));
    }
  }, [mapChanges]);

  return map;
}

function emptyMap<Key, Value>(): ReadonlyMap<Key, Value> {
  return new Map<Key, Value>();
}
