import type { UserIdentity } from "@mp/auth-client";
import { AuthContext, createAuthClient } from "@mp/auth-client";
import { QueryClientProvider } from "@tanstack/solid-query";
import { Router } from "@solidjs/router";
import type { FaroUser } from "@mp/metrics/client";
import {
  faroLoggerHandler,
  getWebInstrumentations,
  initializeFaro,
  TracingInstrumentation,
} from "@mp/metrics/client";
import { createEffect, onCleanup, useContext } from "solid-js";
import Layout from "./ui/Layout";
import { routes } from "./routes";
import { createQueryClient } from "./clients/query";
import { giveAuthClientToTRPC } from "./clients/trpc";
import { env } from "./env";
import { LoggerContext } from "./logger";

// This is effectively the composition root of the application.
// It's okay to define instances in the top level here, but do not export them.
// They should be passed down to the solidjs tree via context.
// We initialize these here because they have significantly large 3rd party dependencies,
// and since App.tsx is lazy loaded, this helps with initial load time.

const faro = initializeFaro({
  url: env.faro.receiverUrl,
  app: { name: "mp-client", version: env.buildVersion },
  instrumentations: [
    ...getWebInstrumentations(),
    new TracingInstrumentation({ instrumentationOptions: env.faro }),
  ],
});

const authClient = createAuthClient(env.auth);
const queryClient = createQueryClient();

giveAuthClientToTRPC(authClient);

export default function App() {
  const logger = useContext(LoggerContext);

  onCleanup(logger.subscribe(faroLoggerHandler(faro)));
  createEffect(() => faro.api.setUser(deriveFaroUser(authClient.identity())));

  return (
    <AuthContext.Provider value={authClient}>
      <QueryClientProvider client={queryClient}>
        <Router root={Layout}>{routes}</Router>
      </QueryClientProvider>
    </AuthContext.Provider>
  );
}

function deriveFaroUser(user?: UserIdentity): FaroUser {
  return { id: user?.id, username: user?.name };
}
