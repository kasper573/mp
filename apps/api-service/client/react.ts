import type { PropsWithChildren } from "preact/compat";
import { createElement, useEffect, useMemo, useState } from "preact/compat";
import type { GraphQLClient } from "./apollo";
import { applyMapChanges, type MapChanges } from "../shared/map-changes";
import { QueryBuilder, QueryBuilderContext } from "./tanstack-query";
import type { useSubscription } from "@apollo/client/react";
import { ApolloProvider } from "@apollo/client/react";

export function GraphQLClientProvider({
  children,
  client,
}: PropsWithChildren<{ client: GraphQLClient }>) {
  const qb = useMemo(() => new QueryBuilder(client), [client]);
  return createElement(QueryBuilderContext.Provider, { value: qb }, [
    // oxlint-disable-next-line no-children-prop
    createElement(ApolloProvider, { client, children }),
  ]);
}

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

export function useMapChanges<Key, Value>(
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
