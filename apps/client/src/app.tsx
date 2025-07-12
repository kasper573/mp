import { createConsoleLogger } from "@mp/logger";
import { createAuthClient } from "@mp/auth/client";
import { ErrorFallbackContext } from "@mp/ui";
import { RouterProvider } from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";
import {
  ctxAuthClient,
  ctxGameRpcClient,
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
import { LoggerContext } from "./logger";
import { createFaroBindings, createFaroClient } from "./integrations/faro";

// This is effectively the composition root of the application.
// It's okay to define instances in the top level here, but do not export them.
// They should be passed down to the component tree via context.
// We initialize these here because they have significantly large 3rd party dependencies,
// and since App.tsx is lazy loaded, this helps with initial load time.

registerEncoderExtensions();

export default function App() {
  const systems = useMemo(createSystems, []);
  useEffect(() => systems.initialize(), [systems]);
  return (
    <>
      <QueryClientProvider client={systems.query}>
        <LoggerContext.Provider value={systems.logger}>
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
        </LoggerContext.Provider>
      </QueryClientProvider>
    </>
  );
}

function createSystems() {
  const logger = createConsoleLogger();
  const socket = createWebSocket(env.wsUrl);
  const auth = createAuthClient(env.auth);
  const router = createClientRouter();
  const faro = createFaroClient();
  const [rpc, initializeRpc] = createRpcClient(
    socket,
    logger,
    () => auth.identity.value?.token,
  );

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
    socket.addEventListener("error", (e) => logger.error(e, "Socket error"));
    const subscriptions = [
      auth.initialize(),
      ioc.register(ctxGameRpcClient, rpc),
      ioc.register(ctxAuthClient, auth),
      initializeRpc(),
      createFaroBindings(faro, auth.identity),
    ];

    return () => {
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
