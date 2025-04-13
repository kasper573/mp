import { Logger } from "@mp/logger";
import { AuthContext, createAuthClient } from "@mp/auth/client";
import { ErrorFallbackContext } from "@mp/ui";
import { RouterProvider } from "@tanstack/solid-router";
import { RPCClientProvider, RPCDevtools } from "@mp/rpc";
import { TanStackRouterDevtools } from "@tanstack/solid-router-devtools";
import { registerSyncExtensions } from "@mp/server";
import { createClientRouter } from "./integrations/router/router";
import { env } from "./env";
import { createRPCClient } from "./integrations/rpc";
import { LoggerContext } from "./logger";

// This is effectively the composition root of the application.
// It's okay to define instances in the top level here, but do not export them.
// They should be passed down to the solidjs tree via context.
// We initialize these here because they have significantly large 3rd party dependencies,
// and since App.tsx is lazy loaded, this helps with initial load time.

registerSyncExtensions();

const auth = createAuthClient(env.auth);
const rpc = createRPCClient();
const router = createClientRouter();
const logger = new Logger();

void auth.refresh();

// eslint-disable-next-line unicorn/prefer-top-level-await
void import("./integrations/faro").then((faro) =>
  faro.init(logger, auth.identity),
);

export default function App() {
  return (
    <>
      <LoggerContext.Provider value={logger}>
        <ErrorFallbackContext.Provider value={{ handleError: logger.error }}>
          <AuthContext.Provider value={auth}>
            <RPCClientProvider client={rpc}>
              <RouterProvider router={router} />
              <TanStackRouterDevtools router={router} />
              <RPCDevtools />
            </RPCClientProvider>
          </AuthContext.Provider>
        </ErrorFallbackContext.Provider>
      </LoggerContext.Provider>
    </>
  );
}
