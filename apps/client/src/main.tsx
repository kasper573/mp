import { createRoot } from "react-dom/client";
import { StrictMode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { createRouter } from "./router";
import { ErrorFallback } from "./components/ErrorFallback";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      refetchOnMount: false,
      refetchOnReconnect: false,
    },
  },
});

const router = createRouter();
const root = createRoot(document.querySelector("div#root")!);
root.render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} defaultErrorComponent={ErrorFallback} />
    </QueryClientProvider>
  </StrictMode>,
);
