import { AuthContext } from "@mp/auth/client";
import { QueryClientProvider } from "@tanstack/solid-query";
import { Router } from "@solidjs/router";
import { createMemo } from "solid-js";
import Layout from "./ui/Layout";
import { routes } from "./routes";
import { authClient } from "./clients/auth";
import { createQueryClient } from "./clients/query";

export default function App() {
  const queryClient = createMemo(createQueryClient);
  return (
    <AuthContext.Provider value={authClient}>
      <QueryClientProvider client={queryClient()}>
        <Router root={Layout}>{routes}</Router>
      </QueryClientProvider>
    </AuthContext.Provider>
  );
}
