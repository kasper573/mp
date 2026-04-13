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
        // oxlint-disable-next-line react/jsx-no-constructed-context-values
        value={{
          displayErrorDetails: env.displayErrorDetails,
          handleError: (e) => systems.logger.error(e, "Preact error"),
        }}
      >
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
        retry: false,
        refetchOnWindowFocus: false,
      },
    },
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
    initialize,
  };
}

const showDevTools = import.meta.env.DEV;
