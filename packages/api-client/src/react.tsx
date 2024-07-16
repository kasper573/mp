import type { CreateTRPCReact, HTTPHeaders } from "@trpc/react-query";
import { createTRPCReact, httpBatchLink } from "@trpc/react-query";
import transformer from "superjson";
import type { ApiRouter, types } from "@mp/trpc-server";
import type { PropsWithChildren } from "react";
import { createContext, useContext } from "react";
import type { QueryClientConfig } from "@tanstack/react-query";
import {
  QueryClient,
  QueryClientProvider,
  useQueryClient as useQueryClientImpl,
} from "@tanstack/react-query";
export type { types } from "@mp/trpc-server";

/**
 * Convenience proxy for accessing the client interface
 * of the API without having to call useContext first.
 */
export const api: ApiClient["react"] = new Proxy({} as ApiClient["react"], {
  get: function useApi(_, key) {
    const trpc = useContext(ApiReactContext);
    return trpc[key as keyof ApiClient["react"]];
  },
});

export function ApiClientProvider({
  value: { react, trpc, query },
  children,
}: PropsWithChildren<{ value: ApiClient }>) {
  return (
    <QueryClientProvider client={query}>
      <ApiReactContext.Provider value={react}>
        <react.Provider client={trpc} queryClient={query}>
          {children}
        </react.Provider>
      </ApiReactContext.Provider>
    </QueryClientProvider>
  );
}

export interface ApiClient {
  react: CreateTRPCReact<ApiRouter, unknown>;
  trpc: ReturnType<CreateTRPCReact<ApiRouter, unknown>["createClient"]>;
  query: ReturnType<typeof createQueryClient>;
}

export interface ApiClientOptions extends QueryClientOptions {
  url: string;
  headers: () => types.TrpcServerHeaders;
}

export function createApiClient({
  url,
  headers,
  ...queryClientOptions
}: ApiClientOptions): ApiClient {
  const query = createQueryClient(queryClientOptions);
  const react = createTRPCReact<ApiRouter>();

  const trpc = react.createClient({
    links: [
      httpBatchLink({
        url,
        transformer,
        headers: () => headers() as unknown as HTTPHeaders,
      }),
    ],
  });
  return { react, trpc, query };
}

const ApiReactContext = createContext<ApiClient["react"]>(
  new Proxy({} as ApiClient["react"], {
    get() {
      throw new Error(
        "You must wrap components using the trpc api with a ApiClientProvider",
      );
    },
  }),
);

interface QueryClientOptions {
  mode: "production" | "development" | "test";
}

function createQueryClient({ mode }: QueryClientOptions): QueryClient {
  const events = new EventTarget();

  const client: QueryClientWithEvents = new QueryClientWithEvents(events, {
    defaultOptions: {
      queries: {
        throwOnError: true,
        retry: mode === "production",
      },
      mutations: {
        onSettled(_, error) {
          if (!error) {
            client.invalidateQueries();
          }
        },
        // Can be overridden by individual mutations
        onError(error) {
          events.dispatchEvent(
            createQueryClientEvent("unhandled-mutation-error", error),
          );
        },
      },
    },
  });

  return client;
}

function useQueryClient(): QueryClientWithEvents {
  return useQueryClientImpl() as QueryClientWithEvents;
}

class QueryClientWithEvents extends QueryClient {
  constructor(
    private events: EventTarget,
    config?: QueryClientConfig,
  ) {
    super(config);
  }

  subscribe<EventType extends keyof QueryClientEvents>(
    eventType: EventType,
    callback: (...args: QueryClientEvents[EventType]) => void,
  ) {
    const handler = (event: Event) =>
      callback(...(event as CustomEvent<QueryClientEvents[EventType]>).detail);
    this.events.addEventListener(eventType, handler);
    return () => {
      this.events.removeEventListener(eventType, handler);
    };
  }
}

interface QueryClientEvents {
  "unhandled-mutation-error": [Error];
}

function createQueryClientEvent<Type extends keyof QueryClientEvents>(
  type: Type,
  ...args: QueryClientEvents[Type]
): CustomEvent<QueryClientEvents[Type]> {
  return new CustomEvent(type, { detail: args });
}
