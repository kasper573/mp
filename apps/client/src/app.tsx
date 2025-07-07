import { createConsoleLogger } from "@mp/logger";
import { AuthContext, createAuthClient } from "@mp/auth/client";
import { ErrorFallbackContext } from "@mp/ui";
import { RouterProvider } from "@tanstack/solid-router";
import { TanStackRouterDevtools } from "@tanstack/solid-router-devtools";
import {
  ctxGameRpcClient,
  ioc,
  registerEncoderExtensions,
} from "@mp/game/client";
import {
  QueryClient,
  QueryClientProvider,
  SolidQueryDevtools,
} from "@mp/rpc/solid";
import { createWebSocket } from "@mp/ws/client";
import { onCleanup } from "solid-js";
import { createClientRouter } from "./integrations/router/router";
import { env } from "./env";
import {
  createRpcClient,
  RpcClientContext,
  SocketContext,
} from "./integrations/rpc";
import { LoggerContext } from "./logger";
import { createFaroClient } from "./integrations/faro";

// This is effectively the composition root of the application.
// It's okay to define instances in the top level here, but do not export them.
// They should be passed down to the solidjs tree via context.
// We initialize these here because they have significantly large 3rd party dependencies,
// and since App.tsx is lazy loaded, this helps with initial load time.

registerEncoderExtensions();

export default function App() {
  const logger = createConsoleLogger();
  const socket = createWebSocket(env.wsUrl);
  const auth = createAuthClient(env.auth);
  const router = createClientRouter();
  const faro = createFaroClient(logger, auth.identity);
  const rpc = createRpcClient(socket, logger, () => auth.identity()?.token);
  const query = new QueryClient({
    defaultOptions: {
      queries: {
        retry: env.retryRpcQueries,
        refetchOnWindowFocus: false,
      },
    },
  });

  void auth.refresh();

  socket.addEventListener("error", (e) => logger.error(e, "Socket error"));
  onCleanup(() => socket.close());
  onCleanup(ioc.register(ctxGameRpcClient, rpc));

  return (
    <>
      <QueryClientProvider client={query}>
        <LoggerContext.Provider value={logger}>
          <ErrorFallbackContext.Provider
            value={{
              handleError: (e) => logger.error(e, "SolidJS error"),
            }}
          >
            <AuthContext.Provider value={auth}>
              <SocketContext.Provider value={socket}>
                <RpcClientContext.Provider value={rpc}>
                  <RouterProvider router={router} />
                  {showDevTools && (
                    <>
                      <TanStackRouterDevtools router={router} />
                      <SolidQueryDevtools client={query} />
                    </>
                  )}
                </RpcClientContext.Provider>
              </SocketContext.Provider>
            </AuthContext.Provider>
          </ErrorFallbackContext.Provider>
        </LoggerContext.Provider>
      </QueryClientProvider>
    </>
  );
}

const showDevTools = import.meta.env.DEV;
