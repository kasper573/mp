import { createConsoleLogger } from "@mp/logger";
import { createAuthClient } from "@mp/auth/client";
import { ErrorFallbackContext } from "@mp/ui";
import { RouterProvider } from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";
import {
  ctxAuthClient,
  ctxGameEventClient,
  ctxLogger,
  ioc,
  registerEncoderExtensions,
} from "@mp/game/client";
import {
  QueryClient,
  QueryClientProvider,
  ReactQueryDevtools,
} from "@mp/query";
import { createWebSocket } from "@mp/ws/client";
import { useEffect, useMemo } from "preact/hooks";
import { createClientRouter } from "./integrations/router/router";
import { env } from "./env";
import { SocketContext } from "./integrations/socket";
import { createFaroBindings, createFaroClient } from "./integrations/faro";

import { createGameEventClient } from "./integrations/game-event-client";
import { enhanceWebSocketWithAuthHandshake } from "./integrations/auth-handshake";
import { ApiProvider, createApiClient } from "@mp/api/sdk";

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
        <SocketContext.Provider value={systems.socket}>
          <ApiProvider queryClient={systems.query} trpcClient={systems.api}>
            <RouterProvider router={systems.router} />
            {showDevTools && (
              <>
                <TanStackRouterDevtools router={systems.router} />
                <ReactQueryDevtools client={systems.query} />
              </>
            )}
          </ApiProvider>
        </SocketContext.Provider>
      </ErrorFallbackContext.Provider>
    </QueryClientProvider>
  );
}

function createSystems() {
  const logger = createConsoleLogger();
  const auth = createAuthClient(env.auth);
  const socketWithoutHandshake = createWebSocket(env.gameServerUrl);
  const eventClientWithoutHandshake = createGameEventClient(
    socketWithoutHandshake,
  );
  const socket = enhanceWebSocketWithAuthHandshake({
    logger,
    socket: socketWithoutHandshake,
    getAccessToken: () => auth.identity.value?.token,
    handshake: (token) => eventClientWithoutHandshake.world.auth(token),
  });
  const router = createClientRouter();
  const faro = createFaroClient();
  const api = createApiClient(env.apiUrl, () => auth.identity.value?.token);

  const eventClient = createGameEventClient(socket);

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
    const logSocketError = (e: Event) => logger.error(e, "Socket error");
    socket.addEventListener("error", logSocketError);
    socket.addEventListener("close", socket.handleCloseEvent);
    const subscriptions = [
      auth.initialize(),
      ioc.register(ctxGameEventClient, eventClient),
      ioc.register(ctxAuthClient, auth),
      ioc.register(ctxLogger, logger),
      createFaroBindings(faro, auth.identity),
    ];

    return () => {
      socket.removeEventListener("error", logSocketError);
      socket.removeEventListener("close", socket.handleCloseEvent);
      socket.close();
      for (const unsubscribe of subscriptions) {
        unsubscribe();
      }
    };
  }

  return {
    auth,
    api,
    socket,
    logger,
    router,
    faro,
    query,
    initialize,
  };
}

const showDevTools = import.meta.env.DEV;
