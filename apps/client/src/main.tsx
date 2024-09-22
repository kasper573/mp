import { QueryClient, QueryClientProvider } from "@tanstack/solid-query";
import { dark } from "@mp/style/themes/dark.css";
import { AuthContext } from "@mp/auth/client";
import * as styles from "./main.css";
import { authClient } from "./api";
import { render } from "solid-js/web";
import { App } from "./App";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      refetchOnMount: false,
      refetchOnReconnect: false,
    },
  },
});

document.documentElement.classList.add(dark);

const rootElement = document.querySelector("div#root")!;
rootElement.classList.add(styles.root);

render(
  () => (
    <AuthContext.Provider value={authClient}>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </AuthContext.Provider>
  ),
  rootElement,
);
