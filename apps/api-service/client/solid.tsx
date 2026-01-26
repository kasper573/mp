import type { ParentProps } from "solid-js";
import { createContext, createMemo, createSignal, onCleanup, useContext } from "solid-js";
import type { GraphQLClient } from "./apollo";
import { QueryBuilder, QueryBuilderContext } from "./tanstack-query";
import type { ResultOf, VariablesOf } from "gql.tada";
import type { TadaDocumentNode } from "gql.tada";
export * from "./use-map-subscription";

export interface SubscriptionResult<Data> {
  data: Data | undefined;
  error: Error | undefined;
}

export function useSubscription<
  Doc extends TadaDocumentNode<unknown, Record<string, unknown>>,
>(
  document: Doc,
  variables?: VariablesOf<Doc>,
): SubscriptionResult<ResultOf<Doc>> {
  const client = useGraphQLClient();
  const [data, setData] = createSignal<ResultOf<Doc>>();
  const [error, setError] = createSignal<Error>();

  const observable = client.subscribe<ResultOf<Doc>>({
    query: document,
    variables: variables as Record<string, unknown>,
  });

  const subscription = observable.subscribe({
    next: (result) => {
      if (result.data) {
        setData(() => result.data as ResultOf<Doc>);
      }
      // Apollo FetchResult has `errors` array, but types may show `error`
      const errors = (result as { errors?: Array<{ message: string }> }).errors;
      const firstError = errors?.[0];
      if (firstError) {
        setError(() => new Error(firstError.message));
      }
    },
    error: (err: Error) => {
      setError(() => err);
    },
  });

  onCleanup(() => {
    subscription.unsubscribe();
  });

  return {
    get data() {
      return data();
    },
    get error() {
      return error();
    },
  };
}

const GraphQLClientContext = createContext<GraphQLClient>();

export function useGraphQLClient(): GraphQLClient {
  const client = useContext(GraphQLClientContext);
  if (!client) {
    throw new Error(
      "useGraphQLClient must be used within a GraphQLClientProvider",
    );
  }
  return client;
}

export function GraphQLClientProvider(
  props: ParentProps<{ client: GraphQLClient }>,
) {
  const qb = createMemo(() => new QueryBuilder(props.client));
  return (
    <GraphQLClientContext.Provider value={props.client}>
      <QueryBuilderContext.Provider value={qb()}>
        {props.children}
      </QueryBuilderContext.Provider>
    </GraphQLClientContext.Provider>
  );
}
