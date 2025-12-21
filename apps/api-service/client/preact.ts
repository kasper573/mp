import { useContext } from "preact/hooks";
import { createContext } from "preact/compat";
import type { GraphQLClient, GraphQLError } from "./apollo";
import type { GraphQLResult } from "tanstack-graphql-query-builder";
import { TanstackGraphQLQueryBuilder } from "tanstack-graphql-query-builder";
import type { ApolloClient } from "@apollo/client";

export function useQueryBuilder() {
  return useContext(QueryBuilderContext);
}

export const QueryBuilderContext = createContext(
  new Proxy({} as QueryBuilder, {
    get() {
      throw new Error("You must provide a QueryBuilderContext");
    },
  }),
);

export class QueryBuilder extends TanstackGraphQLQueryBuilder<GraphQLError> {
  constructor(public readonly client: GraphQLClient) {
    super({
      async query(query, variables) {
        const res = await client.query({ query, variables });
        return coerceApolloResult(res);
      },
      async mutation(mutation, variables) {
        const res = await client.mutate({ mutation, variables });
        return coerceApolloResult(res);
      },
    });
  }
}

function coerceApolloResult<Data>({
  data,
  error,
}: ApolloResult<Data>): GraphQLResult<Data, GraphQLError> {
  if (error) {
    return { ok: false, error };
  }
  // oxlint-disable-next-line no-non-null-assertion
  return { ok: true, data: data! };
}

type ApolloResult<Data> =
  | ApolloClient.MutateResult<Data>
  | ApolloClient.QueryResult<Data>;
