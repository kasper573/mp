import { createRoot } from "react-dom/client";
import { StrictMode } from "react";
import { ApiClientProvider, createApiClient } from "@mp/api-client/react";
import { ApiClientDevtools } from "@mp/api-client/react-devtools";
import { v4 as uuid } from "uuid";
import { App } from "./App";
import { env } from "./env";

const apiClient = createApiClient({
  mode: env.mode,
  url: env.serverUrl,
  connectionParams: () => ({ clientId: getClientId() }),
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

function getClientId() {
  let id = localStorage.getItem("client-id");
  if (id === null) {
    id = uuid();
    localStorage.setItem("client-id", id);
  }
  return id;
}
