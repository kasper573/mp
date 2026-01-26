import type { TypedDocumentNode } from "@graphql-typed-document-node/core";
import type { ApolloClient } from "@apollo/client";
import { createSignal, onCleanup, type Accessor } from "solid-js";
import { useQueryBuilder } from "./tanstack-query";

export interface SubscriptionResult<Data> {
  data: Accessor<Data | undefined>;
  loading: Accessor<boolean>;
  error: Accessor<Error | undefined>;
}

/**
 * SolidJS hook for GraphQL subscriptions using Apollo Client's core subscription API.
 */
export function useSubscription<
  Data,
  Variables extends Record<string, unknown>,
>(
  subscription: TypedDocumentNode<Data, Variables>,
  variables?: Variables,
): SubscriptionResult<Data> {
  const qb = useQueryBuilder();
  const [data, setData] = createSignal<Data | undefined>(undefined);
  const [loading, setLoading] = createSignal(true);
  const [error, setError] = createSignal<Error | undefined>(undefined);

  const observable = qb.client.subscribe<Data, Variables>({
    query: subscription,
    variables,
  } as ApolloClient.SubscribeOptions<Data, Variables>);

  const sub = observable.subscribe({
    next({ data: newData }) {
      setData(() => newData as Data);
      setLoading(false);
      setError(undefined);
    },
    error(err) {
      setData(undefined);
      setLoading(false);
      setError(err);
    },
  });

  onCleanup(() => {
    sub.unsubscribe();
  });

  return { data, loading, error };
}
