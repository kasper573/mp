import { Client } from "@mp/tsock/client";
import { v4 as uuid } from "uuid";
import type { ServerContext, ServerModules } from "@mp/server";
import { env } from "./env";

export type * as types from "@mp/server";

const client = new Client<ServerModules, ServerContext>({
  url: env.serverUrl,
  context: () => ({ clientId: getClientId() }),
  log: console.log,
});

export const api = client.modules;

function getClientId() {
  let id = localStorage.getItem("client-id");
  if (id === null) {
    id = uuid();
    localStorage.setItem("client-id", id);
  }
  return id;
}
