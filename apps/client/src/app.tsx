import { createEffect, onCleanup } from "solid-js";
import { consoleLoggerHandler, Logger } from "@mp/logger";
import { AuthContext, createAuthClient } from "@mp/auth/client";
import { faroLoggerHandler } from "@mp/telemetry/faro";
import { ErrorFallbackContext } from "@mp/ui";
import { QueryClientProvider, TRPCClientContext } from "@mp/solid-trpc";
import { RouterProvider } from "@tanstack/solid-router";
import { SolidQueryDevtools } from "@mp/solid-trpc/devtools";
import { TanStackRouterDevtools } from "@tanstack/solid-router-devtools";
import { createFaroClient, deriveFaroUser } from "./integrations/faro";
import { createQueryClient } from "./integrations/query";
import { createClientRouter } from "./integrations/router/router";
import { env } from "./env";
import { createTRPCClient } from "./integrations/trpc";
import { LoggerContext } from "./logger";

// This is effectively the composition root of the application.
// It's okay to define instances in the top level here, but do not export them.
// They should be passed down to the solidjs tree via context.
// We initialize these here because they have significantly large 3rd party dependencies,
// and since App.tsx is lazy loaded, this helps with initial load time.

const auth = createAuthClient(env.auth);
const query = createQueryClient();
const faro = createFaroClient();
const trpc = createTRPCClient();
const router = createClientRouter();
const logger = new Logger();

logger.subscribe(consoleLoggerHandler(console));
onCleanup(logger.subscribe(faroLoggerHandler(faro)));
createEffect(() => faro.api.setUser(deriveFaroUser(auth.identity())));
void auth.refresh();

export default function App() {
  return (
    <>
      <LoggerContext.Provider value={logger}>
        <ErrorFallbackContext.Provider value={{ handleError: logger.error }}>
          <AuthContext.Provider value={auth}>
            <QueryClientProvider client={query}>
              <TRPCClientContext.Provider value={trpc}>
                <RouterProvider router={router} />
                <TanStackRouterDevtools router={router} />
                <SolidQueryDevtools />
              </TRPCClientContext.Provider>
            </QueryClientProvider>
          </AuthContext.Provider>
        </ErrorFallbackContext.Provider>
      </LoggerContext.Provider>
    </>
  );
}
