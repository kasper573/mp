import type { PropsWithChildren } from "preact/compat";
import { useEffect, useMemo, useState } from "preact/compat";
import type { GraphQLClient } from "./apollo";
import type { MapChanges } from "../shared/map-changes";
import { QueryBuilder, QueryBuilderContext } from "./tanstack-query";
import type { useSubscription } from "@apollo/client/react";
import { ApolloProvider } from "@apollo/client/react";

export function GraphQLClientProvider({
  children,
  client,
}: PropsWithChildren<{ client: GraphQLClient }>) {
  const qb = useMemo(() => new QueryBuilder(client), [client]);
  return (
    <QueryBuilderContext.Provider value={qb}>
      <ApolloProvider client={client}>{children}</ApolloProvider>
    </QueryBuilderContext.Provider>
  );
}

export function useMapSubscription<Data, Key, Value>(
  sub: useSubscription.Result<Data>,
  getChanges: (data: Data) => MapChanges<Key, Value>,
): ReadonlyMap<Key, Value> {
  const [map, setMap] = useState<ReadonlyMap<Key, Value>>(emptyMap);

  useEffect(() => {
    setMap((prev) => {
      const map = new Map(prev);
      const changes = sub.data ? getChanges(sub.data) : null;
      if (changes?.removed) {
        for (const id of changes.removed) {
          map.delete(id);
        }
      }
      if (changes?.added) {
        for (const add of changes.added) {
          map.set(add.key, add.value);
        }
      }
      return map;
    });
    // oxlint-disable-next-line exhaustive-deps
  }, [sub.data]);

  return map;
}

function emptyMap<Key, Value>(): ReadonlyMap<Key, Value> {
  return new Map<Key, Value>();
}
