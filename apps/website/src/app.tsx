import { ApiProvider, createApiClient } from "@mp/api-service/sdk";
import { ctxAuthClient, ctxLogger, ioc } from "@mp/game-client";
import { registerEncoderExtensions } from "@mp/game-shared";
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
import { createFaroBindings, createFaroClient } from "./integrations/faro";
import { createClientRouter } from "./integrations/router/router";

// This is effectively the composition root of the application.
// It's okay to define instances in the top level here, but do not export them.
// They should be passed down to the component tree via context.
// We initialize these here because they have significantly large 3rd party dependencies,
// and since App.tsx is lazy loaded, this helps with initial load time.

registerEncoderExtensions();

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
        <ApiProvider queryClient={systems.query} trpcClient={systems.api}>
          <RouterProvider router={systems.router} />
          {showDevTools && (
            <>
              <TanStackRouterDevtools router={systems.router} />
              <ReactQueryDevtools client={systems.query} />
            </>
          )}
        </ApiProvider>
      </ErrorFallbackContext.Provider>
    </QueryClientProvider>
  );
}

function createSystems() {
  const logger = createConsoleLogger();
  const auth = createAuthClient(env.auth);
  const router = createClientRouter();
  const faro = createFaroClient();
  const api = createApiClient(env.apiUrl, () => auth.identity.value?.token);

  const query = new QueryClient({
    defaultOptions: {
      queries: {
        retry: env.retryApiQueries,
        refetchOnWindowFocus: false,
      },
    },
  });

  function initialize() {
    void auth.refresh();

    const subscriptions = [
      auth.initialize(),
      ioc.register(ctxAuthClient, auth),
      ioc.register(ctxLogger, logger),
      createFaroBindings(faro, auth.identity),
    ];

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
    faro,
    query,
    initialize,
  };
}

const showDevTools = import.meta.env.DEV;
