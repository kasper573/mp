import type { PropsWithChildren } from "preact/compat";
import { useMemo } from "preact/compat";
import type { GraphQLClient } from "./apollo";
import { QueryBuilder, QueryBuilderContext } from "./tanstack-query";
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
