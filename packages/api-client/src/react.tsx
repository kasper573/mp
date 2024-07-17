import type { CreateTRPCReact } from "@trpc/react-query";
import { createTRPCReact } from "@trpc/react-query";
import { createWSClient, wsLink } from "@trpc/client";
import transformer from "superjson";
import type { ServerRouter, ServerContext } from "@mp/server";
import type { PropsWithChildren } from "react";
import { createContext, useContext } from "react";
import type { QueryClientConfig } from "@tanstack/react-query";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

export type * from "@mp/server";

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
  react: CreateTRPCReact<ServerRouter, unknown>;
  trpc: ReturnType<CreateTRPCReact<ServerRouter, unknown>["createClient"]>;
  query: ReturnType<typeof createQueryClient>;
}

export interface ApiClientOptions extends QueryClientOptions {
  url: string;
  connectionParams: () => ServerContext;
}

export function createApiClient({
  url,
  connectionParams,
  ...queryClientOptions
}: ApiClientOptions): ApiClient {
  const query = createQueryClient(queryClientOptions);
  const react = createTRPCReact<ServerRouter>();
  const client = createWSClient({ url, connectionParams });
  const trpc = react.createClient({ links: [wsLink({ client, transformer })] });

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
