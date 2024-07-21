import { Client, Logger } from "@mp/tsock/client";
import type { ClientState, ServerModules } from "@mp/server";
import { env } from "./env";

export const { modules: events, subscribeToState } = new Client<
  ServerModules,
  ClientState
>({
  url: env.serverUrl,
  logger: new Logger(console),
});
