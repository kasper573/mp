import { createApiClient } from "@mp/api-client";
import { v4 as uuid } from "uuid";
import { env } from "./env";

const apiClient = createApiClient({
  url: env.serverUrl,
  context: () => ({ clientId: getClientId() }),
});

const root = document.getElementById("root");
if (root) {
  root.innerHTML = "Hello World";
}

function getClientId() {
  let id = localStorage.getItem("client-id");
  if (id === null) {
    id = uuid();
    localStorage.setItem("client-id", id);
  }
  return id;
}
