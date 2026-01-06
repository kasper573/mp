import { createConsoleLogger } from "@mp/logger";
import { createAuthClient } from "@mp/auth/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { ErrorFallbackContext } from "@mp/ui";
import { RouterProvider } from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";
import { useEffect, useMemo } from "preact/hooks";
import { env } from "./env";
import { AuthContext, LoggerContext } from "./integrations/contexts";
import { initializeFaro } from "./integrations/faro";
import { createClientRouter } from "./integrations/router/router";
import {
  GraphQLClient,
  QueryBuilder,
  QueryBuilderContext,
} from "@mp/api-service/client";
import apiSchemaUrl from "@mp/api-service/client/schema.graphql?url";

// This is effectively the composition root of the application.
// It's okay to define instances in the top level here, but do not export them.
// They should be passed down to the component tree via context.
// We initialize these here because they have significantly large 3rd party dependencies,
// and since App.tsx is lazy loaded, this helps with initial load time.

export default function App() {
  const systems = useMemo(() => createSystems(), []);
  useEffect(() => systems.initialize(), [systems]);
  return (
    <QueryClientProvider client={systems.query}>
      <ErrorFallbackContext.Provider
        value={{
          handleError: (e) => systems.logger.error(e, "Preact error"),
        }}
      >
        <QueryBuilderContext.Provider value={systems.queryBuilder}>
          <LoggerContext.Provider value={systems.logger}>
            <AuthContext.Provider value={systems.auth}>
              <RouterProvider router={systems.router} />
            </AuthContext.Provider>
          </LoggerContext.Provider>
          {showDevTools && (
            <>
              <TanStackRouterDevtools router={systems.router} />
              <ReactQueryDevtools client={systems.query} />
            </>
          )}
        </QueryBuilderContext.Provider>
      </ErrorFallbackContext.Provider>
    </QueryClientProvider>
  );
}

function createSystems() {
  const logger = createConsoleLogger();
  const auth = createAuthClient(env.auth);
  const router = createClientRouter();

  const query = new QueryClient({
    defaultOptions: {
      queries: {
        retry: env.retryApiQueries,
        refetchOnWindowFocus: false,
      },
    },
  });

  const graphqlClient = new GraphQLClient({
    serverUrl: env.apiUrl,
    schema: () => fetch(apiSchemaUrl).then((res) => res.text()),
    fetchOptions(init) {
      const token = auth.identity.value?.token;
      const headers = new Headers(init?.headers);
      if (token) {
        headers.set("Authorization", `Bearer ${token}`);
      }
      return { ...init, headers };
    },
  });

  const queryBuilder = new QueryBuilder(graphqlClient);

  function initialize() {
    void auth.refresh();

    const subscriptions = [auth.initialize(), initializeFaro(auth.identity)];

    return () => {
      for (const unsubscribe of subscriptions) {
        unsubscribe();
      }
    };
  }

  return {
    auth,
    logger,
    router,
    query,
    graphqlClient,
    queryBuilder,
    initialize,
  };
}

const showDevTools = import.meta.env.DEV;
