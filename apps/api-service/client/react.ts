import type { PropsWithChildren } from "preact/compat";
import { createElement, useMemo } from "preact/compat";
import type { GraphQLClient } from "./apollo";
import { QueryBuilder, QueryBuilderContext } from "./tanstack-query";
import { ApolloProvider } from "@apollo/client/react";

export * from "./use-map-subscription";

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
