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
import { useEffect } from "react";
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
// They should be passed down to the react tree via context.
// We initialize these here because they have significantly large 3rd party dependencies,
// and since App.tsx is lazy loaded, this helps with initial load time.

registerEncoderExtensions();

export default function App() {
  const logger = createConsoleLogger();
  const socket = createWebSocket(env.wsUrl);
  const auth = createAuthClient(env.auth);
  const router = createClientRouter();
  const faro = createFaroClient();
  const [rpc, initializeRpc] = createRpcClient(
    socket,
    logger,
    () => auth.identity.get()?.token,
  );

  const query = new QueryClient({
    defaultOptions: {
      queries: {
        retry: env.retryRpcQueries,
        refetchOnWindowFocus: false,
      },
    },
  });

  useEffect(() => {
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
  }, []);

  void auth.refresh();

  return (
    <>
      <QueryClientProvider client={query}>
        <LoggerContext.Provider value={logger}>
          <ErrorFallbackContext.Provider
            value={{
              handleError: (e) => logger.error(e, "ReactJS error"),
            }}
          >
            <SocketContext.Provider value={socket}>
              <RpcClientContext.Provider value={rpc}>
                <RouterProvider router={router} />
                {showDevTools && (
                  <>
                    <TanStackRouterDevtools router={router} />
                    <ReactQueryDevtools client={query} />
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

const showDevTools = import.meta.env.DEV;
