import { consoleLoggerHandler, Logger } from "@mp/logger";
import { AuthContext, createAuthClient } from "@mp/auth/client";
import { ErrorFallbackContext } from "@mp/ui";
import { RouterProvider } from "@tanstack/solid-router";
import { TanStackRouterDevtools } from "@tanstack/solid-router-devtools";
import { registerEncoderExtensions } from "@mp/game/client";
import { GameRpcSliceApiContext } from "@mp/game/client";
import { QueryClient, QueryClientProvider } from "@mp/rpc/solid";
import { createReconnectingWebSocket } from "@mp/ws/client";
import { createClientRouter } from "./integrations/router/router";
import { env } from "./env";
import {
  createRpcClient,
  RpcClientContext,
  SocketContext,
} from "./integrations/rpc";
import { LoggerContext } from "./logger";

// This is effectively the composition root of the application.
// It's okay to define instances in the top level here, but do not export them.
// They should be passed down to the solidjs tree via context.
// We initialize these here because they have significantly large 3rd party dependencies,
// and since App.tsx is lazy loaded, this helps with initial load time.

registerEncoderExtensions();

const logger = new Logger();
logger.subscribe(consoleLoggerHandler(console));

const query = new QueryClient({
  defaultOptions: { queries: { retry: env.retryRpcQueries } },
});
const socket = createReconnectingWebSocket(env.wsUrl);
const auth = createAuthClient(env.auth);
const rpc = createRpcClient(socket, logger);
const router = createClientRouter();

socket.addEventListener("error", (e) => logger.error("Socket error", e));
void auth.refresh();

// eslint-disable-next-line unicorn/prefer-top-level-await
void import("./integrations/faro").then((faro) =>
  faro.init(logger, auth.identity),
);

export default function App() {
  return (
    <>
      <QueryClientProvider client={query}>
        <LoggerContext.Provider value={logger}>
          <ErrorFallbackContext.Provider
            value={{
              handleError: (e) => logger.error("SolidJS error", e),
            }}
          >
            <AuthContext.Provider value={auth}>
              <SocketContext.Provider value={socket}>
                <RpcClientContext.Provider value={rpc}>
                  <GameRpcSliceApiContext.Provider value={rpc}>
                    <RouterProvider router={router} />
                    <TanStackRouterDevtools router={router} />
                  </GameRpcSliceApiContext.Provider>
                </RpcClientContext.Provider>
              </SocketContext.Provider>
            </AuthContext.Provider>
          </ErrorFallbackContext.Provider>
        </LoggerContext.Provider>
      </QueryClientProvider>
    </>
  );
}
