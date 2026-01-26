import {
  skipToken,
  type SkipToken,
  type QueryKey,
  type QueryFunctionContext,
} from "@tanstack/solid-query";
import type { TypedDocumentNode } from "@graphql-typed-document-node/core";
import type { DocumentNode } from "graphql";
import { print } from "graphql";
import { createContext, useContext } from "solid-js";
import type { GraphQLClient } from "./apollo";
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

interface QueryOptions<Data, Selection = Data> {
  queryKey: QueryKey;
  queryFn: (() => Promise<Data>) | SkipToken;
  select?: (data: Data) => Selection;
}

interface MutationOptions<Data, Vars> {
  mutationKey: QueryKey;
  mutationFn: (variables: Vars) => Promise<Data>;
}

interface InfiniteQueryOptions<Data, _Vars, Selection = Data> {
  queryKey: QueryKey;
  queryFn: ((ctx: QueryFunctionContext) => Promise<Data>) | SkipToken;
  select?: (data: Data) => Selection;
}

export class QueryBuilder {
  constructor(public readonly client: GraphQLClient) {}

  queryOptions<Data, Vars extends GraphQLVariablesLike, Selection = Data>(
    query: TypedDocumentNode<Data, Vars>,
    ...[vars]: SkippableVariableArgs<Vars>
  ): QueryOptions<Data, Selection> {
    return {
      queryKey: queryKey(query, vars),
      queryFn: vars === skipToken ? skipToken : this.queryFn(query, vars),
    };
  }

  suspenseQueryOptions<
    Data,
    Vars extends GraphQLVariablesLike,
    Selection = Data,
  >(
    query: TypedDocumentNode<Data, Vars>,
    ...[vars]: UnskippableVariableArgs<Vars>
  ): QueryOptions<Data, Selection> {
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
  ): Omit<InfiniteQueryOptions<Data, Vars, Selection>, "getNextPageParam" | "initialPageParam"> {
    return {
      queryKey: queryKey(query, vars),
      queryFn: vars === skipToken ? skipToken : this.queryFn(query, vars),
    };
  }

  suspenseInfiniteQueryOptions<
    Data,
    Vars extends GraphQLVariablesLike,
    Selection = Data,
  >(
    query: TypedDocumentNode<Data, Vars>,
    ...[vars]: UnskippableVariableArgs<Vars>
  ): Omit<InfiniteQueryOptions<Data, Vars, Selection>, "getNextPageParam" | "initialPageParam"> {
    return {
      queryKey: queryKey(query, vars),
      queryFn: this.queryFn(query, vars),
    };
  }

  mutationOptions<Data, Vars extends GraphQLVariablesLike>(
    mutation: TypedDocumentNode<Data, Vars>,
  ): MutationOptions<Data, Vars> {
    return {
      mutationKey: queryKey(mutation, undefined),
      mutationFn: async (variables: Vars) => {
        const res = await this.client.mutate({ mutation, variables });
        return assertResponse(res);
      },
    };
  }

  private queryFn<Data, Vars extends GraphQLVariablesLike>(
    query: TypedDocumentNode<Data, Vars>,
    vars: Vars | undefined,
  ) {
    return async (): Promise<Data> => {
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
  return (data ?? null) as Data;
}

type ApolloResult<Data> =
  | ApolloClient.MutateResult<Data>
  | ApolloClient.QueryResult<Data>;

type UnskippableVariableArgs<Vars> =
  HasRequiredKeys<Vars> extends true ? [Vars] : [Vars?];

type SkippableVariableArgs<Vars> =
  HasRequiredKeys<Vars> extends true ? [Vars | SkipToken] : [Vars?];

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
