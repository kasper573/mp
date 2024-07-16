import { createRoot } from "react-dom/client";
import { StrictMode } from "react";
import { App } from "./App";
import { ApiClientProvider, createApiClient } from "@mp/api-client/react";
import { env } from "./env";
import { ApiClientDevtools } from "@mp/api-client/react-devtools";

const apiClient = createApiClient({
  mode: env.mode,
  url: env.serverUrl,
  headers: () => ({ "client-id": "123" }),
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
