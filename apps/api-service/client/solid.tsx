import type { JSX } from "solid-js";
import {
  createContext,
  createMemo,
  createSignal,
  createEffect,
  onCleanup,
  useContext,
} from "solid-js";
import type { GraphQLClient } from "./apollo";
import { QueryBuilder, QueryBuilderContext } from "./tanstack-query";
import type { TypedDocumentNode } from "@graphql-typed-document-node/core";

export * from "./use-map-subscription";

// Context for the Apollo client (used for subscriptions)
export const GraphQLClientContext = createContext<GraphQLClient | undefined>(
  undefined,
);

export interface GraphQLClientProviderProps {
  children: JSX.Element;
  client: GraphQLClient;
}

export function GraphQLClientProvider(props: GraphQLClientProviderProps) {
  const qb = createMemo(() => new QueryBuilder(props.client));
  return (
    <GraphQLClientContext.Provider value={props.client}>
      <QueryBuilderContext.Provider value={qb()}>
        {props.children}
      </QueryBuilderContext.Provider>
    </GraphQLClientContext.Provider>
  );
}

// SolidJS-compatible subscription hook result
export interface UseSubscriptionResult<TData> {
  data: TData | undefined;
  loading: boolean;
  error: Error | undefined;
}

/**
 * SolidJS hook for GraphQL subscriptions using Apollo Client.
 */
export function useSubscription<
  TData,
  TVariables extends Record<string, unknown>,
>(
  subscription: TypedDocumentNode<TData, TVariables>,
  variables?: TVariables,
): UseSubscriptionResult<TData> {
  const client = useContext(GraphQLClientContext);
  if (!client) {
    throw new Error(
      "useSubscription must be used within a GraphQLClientProvider",
    );
  }

  const [data, setData] = createSignal<TData | undefined>(undefined);
  const [loading, setLoading] = createSignal(true);
  const [error, setError] = createSignal<Error | undefined>(undefined);

  createEffect(() => {
    setLoading(true);
    setError(undefined);

    const observable = client.subscribe({
      query: subscription,
      variables: variables as TVariables,
    });

    const sub = observable.subscribe({
      next: (result) => {
        setData(() => result.data as TData | undefined);
        setLoading(false);
      },
      error: (err) => {
        setError(err as Error);
        setLoading(false);
      },
    });

    onCleanup(() => {
      sub.unsubscribe();
    });
  });

  return {
    get data() {
      return data();
    },
    get loading() {
      return loading();
    },
    get error() {
      return error();
    },
  };
}
