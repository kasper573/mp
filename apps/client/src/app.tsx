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
} from "@mp/rpc/react";
import { createWebSocket } from "@mp/ws/client";
import { useEffect, useMemo } from "preact/hooks";
import { createClientRouter } from "./integrations/router/router";
import { env } from "./env";
import {
  createRpcClient,
  RpcClientContext,
  SocketContext,
} from "./integrations/rpc";
import { createFaroBindings, createFaroClient } from "./integrations/faro";

import { createGameEventClient } from "./integrations/game-event-client";
import { enhanceWebSocketWithAuthHandshake } from "./integrations/auth-handshake";

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
          <RpcClientContext.Provider value={systems.rpc}>
            <RouterProvider router={systems.router} />
            {showDevTools && (
              <>
                <TanStackRouterDevtools router={systems.router} />
                <ReactQueryDevtools client={systems.query} />
              </>
            )}
          </RpcClientContext.Provider>
        </SocketContext.Provider>
      </ErrorFallbackContext.Provider>
    </QueryClientProvider>
  );
}

function createSystems() {
  const logger = createConsoleLogger();
  const auth = createAuthClient(env.auth);
  const socket = enhanceWebSocketWithAuthHandshake({
    logger,
    socket: createWebSocket(env.wsUrl),
    getAccessToken: () => auth.identity.value?.token,
    handshake: (token) => rpc.system.auth(token),
  });
  const router = createClientRouter();
  const faro = createFaroClient();
  const [rpc, initializeRpc] = createRpcClient(socket, logger);

  const eventClient = createGameEventClient(socket);

  const query = new QueryClient({
    defaultOptions: {
      queries: {
        retry: env.retryRpcQueries,
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
      initializeRpc(),
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
    rpc,
    socket,
    logger,
    router,
    faro,
    query,
    initialize,
  };
}

const showDevTools = import.meta.env.DEV;
