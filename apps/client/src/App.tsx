import { AuthContext, createAuthClient } from "@mp/auth-client";
import { QueryClientProvider } from "@tanstack/solid-query";
import { Router } from "@solidjs/router";
import Layout from "./ui/Layout";
import { routes } from "./routes";
import { createQueryClient } from "./clients/query";
import { giveAuthClientToTRPC } from "./clients/trpc";
import { env } from "./env";
import { createFaroClient, useFaroIntegration } from "./clients/faro";

// This is effectively the composition root of the application.
// It's okay to define instances in the top level here, but do not export them.
// They should be passed down to the solidjs tree via context.
// We initialize these here because they have significantly large 3rd party dependencies,
// and since App.tsx is lazy loaded, this helps with initial load time.

const authClient = createAuthClient(env.auth);
const queryClient = createQueryClient();
const faroClient = createFaroClient();

giveAuthClientToTRPC(authClient);

export default function App() {
  useFaroIntegration(faroClient, authClient);
  return (
    <AuthContext.Provider value={authClient}>
      <QueryClientProvider client={queryClient}>
        <Router root={Layout}>{routes}</Router>
      </QueryClientProvider>
    </AuthContext.Provider>
  );
}
