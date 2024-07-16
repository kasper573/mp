import { createRoot } from "react-dom/client";
import { StrictMode } from "react";
import { ApiClientProvider, createApiClient } from "@mp/api-client/react";
import { ApiClientDevtools } from "@mp/api-client/react-devtools";
import { App } from "./App";
import { env } from "./env";

const apiClient = createApiClient({
  mode: env.mode,
  url: env.serverUrl,
  connectionParams: () => ({ "client-id": "123" }),
});

const rootElement = document.getElementById("root");
if (rootElement) {
  createRoot(rootElement).render(
    <StrictMode>
      <ApiClientProvider value={apiClient}>
        <App />
        <ApiClientDevtools />
      </ApiClientProvider>
    </StrictMode>,
  );
} else {
  document.writeln("Could not find root element");
}
