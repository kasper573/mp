import { AuthContext, createAuthClient } from "@mp/auth-client";
import { QueryClientProvider } from "npm:@tanstack/solid-query";
import { Router } from "npm:@solidjs/router";
import { TRPCClientContext } from "@mp/solid-trpc";
import Layout from "./ui/Layout.tsx";
import { routes } from "./routes.tsx";
import { createQueryClient } from "./integrations/query.ts";
import { env } from "./env.ts";
import { createFaroClient, useFaroIntegration } from "./integrations/faro.ts";
import { createTRPCClient } from "./integrations/trpc.ts";

// This is effectively the composition root of the application.
// It's okay to define instances in the top level here, but do not export them.
// They should be passed down to the solidjs tree via context.
// We initialize these here because they have significantly large 3rd party dependencies,
// and since App.tsx is lazy loaded, this helps with initial load time.

const auth = createAuthClient(env.auth);
const query = createQueryClient();
const faro = createFaroClient();
const trpc = createTRPCClient(auth);

export default function App() {
  useFaroIntegration(faro, auth);
  return (
    <AuthContext.Provider value={auth}>
      <QueryClientProvider client={query}>
        <TRPCClientContext.Provider value={trpc}>
          <Router root={Layout}>{routes}</Router>
        </TRPCClientContext.Provider>
      </QueryClientProvider>
    </AuthContext.Provider>
  );
}
