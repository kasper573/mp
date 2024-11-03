import { AuthContext, createAuthClient } from "@mp/auth/client";
import { QueryClientProvider } from "@tanstack/solid-query";
import { Router } from "@solidjs/router";
import Layout from "./ui/Layout";
import { routes } from "./routes";
import { createQueryClient } from "./clients/query";
import { env } from "./env";
import { giveAuthClientToTRPC } from "./clients/trpc";

const authClient = createAuthClient(env.auth.publishableKey);
const queryClient = createQueryClient();

giveAuthClientToTRPC(authClient);

export default function App() {
  return (
    <AuthContext.Provider value={authClient}>
      <QueryClientProvider client={queryClient}>
        <Router root={Layout}>{routes}</Router>
      </QueryClientProvider>
    </AuthContext.Provider>
  );
}
