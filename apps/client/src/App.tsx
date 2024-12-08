import { AuthContext, createAuthClient } from "@mp/auth-client";
import { QueryClientProvider } from "@tanstack/solid-query";
import { Router } from "@solidjs/router";
import Layout from "./ui/Layout.tsx";
import { routes } from "./routes.tsx";
import { createQueryClient } from "./clients/query.ts";
import { env } from "./env.ts";
import { giveAuthClientToTRPC } from "./clients/trpc.ts";

const authClient = createAuthClient(env.auth);
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
