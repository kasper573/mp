import { AuthContext } from "@mp/auth/client";
import { QueryClientProvider } from "@tanstack/solid-query";
import { ErrorBoundary, Suspense } from "solid-js";
import GamePage from "./pages/game/GamePage";
import Layout from "./ui/Layout";
import { authClient, queryClient } from "./state/api";
import { ErrorFallback } from "./ui/ErrorFallback";
import { Loading } from "./ui/Loading";

export default function App() {
  return (
    <AuthContext.Provider value={authClient}>
      <QueryClientProvider client={queryClient}>
        <ErrorBoundary fallback={ErrorFallback}>
          <Layout>
            <Suspense fallback={<Loading />}>
              <GamePage />
            </Suspense>
          </Layout>
        </ErrorBoundary>
      </QueryClientProvider>
    </AuthContext.Provider>
  );
}
