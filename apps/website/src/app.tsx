import { ApiProvider, createApiClient } from "@mp/api-service/sdk";
import { createConsoleLogger } from "@mp/logger";
import { createAuthClient } from "@mp/oauth/client";
import {
  QueryClient,
  QueryClientProvider,
  ReactQueryDevtools,
} from "@mp/query";
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
} from "@mp/graphql/client";

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
          <ApiProvider queryClient={systems.query} trpcClient={systems.api}>
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
          </ApiProvider>
        </QueryBuilderContext.Provider>
      </ErrorFallbackContext.Provider>
    </QueryClientProvider>
  );
}

function createSystems() {
  const logger = createConsoleLogger();
  const auth = createAuthClient(env.auth);
  const router = createClientRouter();
  const api = createApiClient(env.apiUrl, () => auth.identity.value?.token);

  const query = new QueryClient({
    defaultOptions: {
      queries: {
        retry: env.retryApiQueries,
        refetchOnWindowFocus: false,
      },
    },
  });

  const graphqlClient = new GraphQLClient("http://localhost:4000/graphql");

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
    api,
    logger,
    router,
    query,
    graphqlClient,
    queryBuilder,
    initialize,
  };
}

const showDevTools = import.meta.env.DEV;
