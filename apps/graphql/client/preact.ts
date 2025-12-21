import { useContext } from "preact/hooks";
import { createContext } from "preact/compat";
import { GraphQLClient, GraphQLError } from "./apollo";
import {
  GraphQLResult,
  TanstackGraphQLQueryBuilder,
} from "tanstack-graphql-query-builder";
import { ApolloClient, MutateResult } from "@apollo/client";

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
  constructor(client: GraphQLClient) {
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
  return { ok: true, data: data! };
}

type ApolloResult<Data> =
  | ApolloClient.MutateResult<Data>
  | ApolloClient.QueryResult<Data>;
