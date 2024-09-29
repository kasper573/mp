import { AuthContext } from "@mp/auth/client";
import { QueryClientProvider } from "@tanstack/solid-query";
import { Router } from "@solidjs/router";
import { authClient, queryClient } from "./state/api";
import Layout from "./ui/Layout";
import { routes } from "./routes";

export default function App() {
  return (
    <AuthContext.Provider value={authClient}>
      <QueryClientProvider client={queryClient}>
        <Router root={Layout}>{routes}</Router>
      </QueryClientProvider>
    </AuthContext.Provider>
  );
}
