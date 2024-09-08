import { createRoot } from "react-dom/client";
import { StrictMode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { dark } from "@mp/style/themes/dark.css";
import { AuthContext } from "@mp/auth/client";
import { createRouter } from "./router";
import { ErrorFallback } from "./components/ErrorFallback";
import * as styles from "./main.css";
import { authClient } from "./api";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      refetchOnMount: false,
      refetchOnReconnect: false,
    },
  },
});

void authClient.load();

document.documentElement.classList.add(dark);

const router = createRouter();

const rootElement = document.querySelector("div#root")!;
rootElement.classList.add(styles.root);

const reactRoot = createRoot(rootElement);

reactRoot.render(
  <StrictMode>
    <AuthContext.Provider value={authClient}>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} defaultErrorComponent={ErrorFallback} />
      </QueryClientProvider>
    </AuthContext.Provider>
  </StrictMode>,
);
