import * as tanstack from "@tanstack/react-query";
import type { TypedDocumentNode } from "@graphql-typed-document-node/core";
import type { DocumentNode } from "graphql";
import { print } from "graphql";
import { useContext } from "preact/hooks";
import { createContext } from "preact/compat";
import type { GraphQLClient, GraphQLError } from "./apollo";
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

/**
 * Integrates GraphQL with TanStack Query.
 * The methods return options objects that can be directly passed to TanStack Query hooks.
 *
 * @example
 * function MyComponent() {
 *   const qb = useQueryBuilder();
 *   const { data, error } = useQuery(qb.queryOptions(MyQueryDocument, { var1: "value" }));
 *   // ...
 * }
 */
export class QueryBuilder {
  constructor(public readonly client: GraphQLClient) {}

  queryOptions<Data, Vars extends GraphQLVariablesLike, Selection = Data>(
    query: TypedDocumentNode<Data, Vars>,
    ...[vars]: SkippableVariableArgs<Vars>
  ): tanstack.UseQueryOptions<Data, GraphQLError, Selection> {
    return {
      queryKey: queryKey(query, vars),
      queryFn:
        vars === tanstack.skipToken
          ? tanstack.skipToken
          : this.queryFn(query, vars),
    };
  }

  suspenseQueryOptions<
    Data,
    Vars extends GraphQLVariablesLike,
    Selection = Data,
  >(
    query: TypedDocumentNode<Data, Vars>,
    ...[vars]: UnskippableVariableArgs<Vars>
  ): tanstack.UseSuspenseQueryOptions<Data, GraphQLError, Selection> {
    return {
      queryKey: queryKey(query, vars),
      queryFn: this.queryFn(query, vars),
    };
  }

  infiniteQueryOptions<
    Data,
    Vars extends GraphQLVariablesLike,
    Selection = Data,
  >(
    query: TypedDocumentNode<Data, Vars>,
    ...[vars]: SkippableVariableArgs<Vars>
  ): Omit<
    tanstack.UseInfiniteQueryOptions<
      Data,
      GraphQLError,
      Selection,
      tanstack.QueryKey,
      Vars
    >,
    "getNextPageParam" | "initialPageParam"
  > {
    return {
      queryKey: queryKey(query, vars),
      queryFn:
        vars === tanstack.skipToken
          ? tanstack.skipToken
          : this.queryFn(query, vars),
    };
  }

  suspenseInfiniteQueryOptions<
    Data,
    Vars extends GraphQLVariablesLike,
    Selection = Data,
  >(
    query: TypedDocumentNode<Data, Vars>,
    ...[vars]: UnskippableVariableArgs<Vars>
  ): Omit<
    tanstack.UseSuspenseInfiniteQueryOptions<
      Data,
      GraphQLError,
      Selection,
      tanstack.QueryKey,
      Vars
    >,
    "getNextPageParam" | "initialPageParam"
  > {
    return {
      queryKey: queryKey(query, vars),
      queryFn: this.queryFn(query, vars),
    };
  }

  mutationOptions<Data, Vars extends GraphQLVariablesLike, TOnMutateResult>(
    mutation: TypedDocumentNode<Data, Vars>,
  ): tanstack.UseMutationOptions<Data, GraphQLError, Vars, TOnMutateResult> {
    return {
      mutationKey: queryKey(mutation, undefined),
      mutationFn: async (variables) => {
        const res = await this.client.mutate({ mutation, variables });
        return assertResponse(res);
      },
    };
  }

  private queryFn<Data, Vars extends GraphQLVariablesLike>(
    query: TypedDocumentNode<Data, Vars>,
    vars: Vars | undefined,
  ) {
    return async (_: tanstack.QueryFunctionContext): Promise<Data> => {
      const res = await this.client.query({
        query,
        variables: assertVars(vars),
      });
      return assertResponse(res);
    };
  }
}

function queryKey(doc: DocumentNode, vars: unknown): unknown[] {
  return [print(doc), vars];
}

function assertVars<Vars>(vars: Vars | undefined): Vars {
  if (vars === undefined) {
    return {} as Vars;
  }
  return vars;
}

function assertResponse<Data>({ data, error }: ApolloResult<Data>): Data {
  if (error) {
    throw error;
  }
  // Tanstack Query does not support undefined as a valid response, so we coerce it to null.
  return (data ?? null) as Data;
}

type ApolloResult<Data> =
  | ApolloClient.MutateResult<Data>
  | ApolloClient.QueryResult<Data>;

type UnskippableVariableArgs<Vars> =
  HasRequiredKeys<Vars> extends true ? [Vars] : [Vars?];

type SkippableVariableArgs<Vars> =
  HasRequiredKeys<Vars> extends true ? [Vars | tanstack.SkipToken] : [Vars?];

type HasRequiredKeys<T> = RequiredKeysOf<T> extends never ? false : true;
type RequiredKeysOf<BaseType> = Exclude<
  {
    [Key in keyof BaseType]: BaseType extends Record<Key, BaseType[Key]>
      ? Key
      : never;
  }[keyof BaseType],
  undefined
>;

type GraphQLVariablesLike = Record<string, unknown>;
