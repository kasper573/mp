import { createClient } from "@mp/tsock/client";
import { v4 as uuid } from "uuid";
import type { ServerContext, ServerRouter } from "@mp/server";
import { env } from "./env";

export type * from "@mp/server";

export const api = createClient<ServerRouter, ServerContext>({
  url: env.serverUrl,
  context: () => ({ clientId: getClientId() }),
});

function getClientId() {
  let id = localStorage.getItem("client-id");
  if (id === null) {
    id = uuid();
    localStorage.setItem("client-id", id);
  }
  return id;
}
