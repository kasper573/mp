import * as tanstack from "@tanstack/react-query";
import type { TypedDocumentNode } from "@graphql-typed-document-node/core";
import { DocumentNode, print } from "graphql";

export class TanstackGraphQLQueryBuilder<Err> {
  #client: GraphQLClientIntegration<Err>;

  constructor(
    client: GraphQLClientIntegration<Err>,
    private queryKey = defaultQueryKey,
    private coerceResponse = defaultCoerceResponse,
  ) {
    this.#client = client;
  }

  queryOptions<Data, Vars extends GraphQLVariablesLike, Selection = Data>(
    query: TypedDocumentNode<Data, Vars>,
    ...[vars]: SkippableVariableArgs<Vars>
  ): tanstack.UseQueryOptions<Data, Err, Selection> {
    return {
      queryKey: this.queryKey(query, vars),
      queryFn:
        vars === tanstack.skipToken ? undefined : this.queryFn(query, vars),
    };
  }

  suspenseQueryOptions<
    Data,
    Vars extends GraphQLVariablesLike,
    Selection = Data,
  >(
    query: TypedDocumentNode<Data, Vars>,
    ...[vars]: UnskippableVariableArgs<Vars>
  ): tanstack.UseSuspenseQueryOptions<Data, Err, Selection> {
    return {
      queryKey: this.queryKey(query, vars),
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
      Err,
      Selection,
      tanstack.QueryKey,
      Vars
    >,
    "getNextPageParam" | "initialPageParam"
  > {
    return {
      queryKey: this.queryKey(query, vars),
      queryFn:
        vars === tanstack.skipToken ? undefined : this.queryFn(query, vars),
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
      Err,
      Selection,
      tanstack.QueryKey,
      Vars
    >,
    "getNextPageParam" | "initialPageParam"
  > {
    return {
      queryKey: this.queryKey(query, vars),
      queryFn: this.queryFn(query, vars),
    };
  }

  mutationOptions<Data, Vars extends GraphQLVariablesLike, TOnMutateResult>(
    node: TypedDocumentNode<Data, Vars>,
  ): tanstack.UseMutationOptions<Data, Err, Vars, TOnMutateResult> {
    return {
      mutationKey: this.queryKey(node, undefined),
      mutationFn: async (vars, context) => {
        const res = await this.#client.mutation(node, vars, context);
        if (!res.ok) {
          throw res.error;
        }
        return this.coerceResponse(res.data);
      },
    };
  }

  private queryFn<Data, Vars extends GraphQLVariablesLike>(
    query: TypedDocumentNode<Data, Vars>,
    vars: Vars | undefined,
  ) {
    return async (context: tanstack.QueryFunctionContext): Promise<Data> => {
      const res = await this.#client.query(query, assertVars(vars), context);

      if (!res.ok) {
        throw res.error;
      }

      return this.coerceResponse(res.data);
    };
  }
}

export function defaultQueryKey(doc: DocumentNode, vars: unknown): unknown[] {
  return [print(doc), vars];
}

export function assertVars<Vars>(vars: Vars | undefined): Vars {
  if (vars === undefined) {
    return {} as Vars;
  }
  return vars;
}

export function defaultCoerceResponse<Data>(data: Data): Data {
  // Tanstack Query does not support undefined as a valid response, so we coerce it to null.
  return (data ?? null) as Data;
}

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

export type GraphQLResult<Data, Err> =
  | { ok: true; data: Data }
  | { ok: false; error: Err };

export type GraphQLVariablesLike = Record<string, unknown>;

export interface GraphQLClientIntegration<Err> {
  query<Data, Vars extends GraphQLVariablesLike>(
    doc: TypedDocumentNode<Data, Vars>,
    variables: Vars,
    context: tanstack.QueryFunctionContext,
  ): Promise<GraphQLResult<Data, Err>>;

  mutation<Data, Vars extends GraphQLVariablesLike>(
    doc: TypedDocumentNode<Data, Vars>,
    variables: Vars,
    context: tanstack.MutationFunctionContext,
  ): Promise<GraphQLResult<Data, Err>>;
}
