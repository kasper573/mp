import { createConsoleLogger } from "@mp/logger";
import { createAuthClient } from "@mp/auth/client";
import { QueryClient, QueryClientProvider } from "@tanstack/solid-query";
import { SolidQueryDevtools } from "@tanstack/solid-query-devtools";
import { ErrorFallbackContext } from "@mp/ui";
import { RouterProvider } from "@tanstack/solid-router";
import { onMount, onCleanup, Show } from "solid-js";
import { env } from "./env";
import { AuthContext, LoggerContext } from "./integrations/contexts";
import { initializeFaro } from "./integrations/faro";
import { createClientRouter } from "./integrations/router/router";
import { GraphQLClient, GraphQLClientProvider } from "@mp/api-service/client";
import apiSchemaUrl from "@mp/api-service/client/schema.graphql?url";

// This is effectively the composition root of the application.
// It's okay to define instances in the top level here, but do not export them.
// They should be passed down to the component tree via context.
// We initialize these here because they have significantly large 3rd party dependencies,
// and since App.tsx is lazy loaded, this helps with initial load time.

export default function App() {
  const systems = createSystems();

  onMount(() => {
    const cleanup = systems.initialize();
    onCleanup(cleanup);
  });

  return (
    <QueryClientProvider client={systems.query}>
      <ErrorFallbackContext.Provider
        value={{
          displayErrorDetails: env.displayErrorDetails,
          handleError: (e) => systems.logger.error(e, "SolidJS error"),
        }}
      >
        <GraphQLClientProvider client={systems.graphqlClient}>
          <LoggerContext.Provider value={systems.logger}>
            <AuthContext.Provider value={systems.auth}>
              <RouterProvider router={systems.router} />
            </AuthContext.Provider>
          </LoggerContext.Provider>
          <Show when={showDevTools}>
            <SolidQueryDevtools client={systems.query} />
          </Show>
        </GraphQLClientProvider>
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
    url: env.api.url,
    subscriptionsUrl: env.api.subscriptionsUrl,
    schema: () => fetch(apiSchemaUrl).then((res) => res.text()),
    getAccessToken: () => auth.identity.get()?.token,
  });

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
    initialize,
  };
}

const showDevTools = import.meta.env.DEV;
