import { Client, Logger } from "@mp/tsock/client";
import type { ClientContext, ServerModules } from "@mp/server";
import { env } from "./env";

export type * as types from "@mp/server";

const client = new Client<ServerModules, ClientContext>({
  url: env.serverUrl,
  context: () => ({}),
  logger: new Logger(console),
});

export const api = client.modules;
