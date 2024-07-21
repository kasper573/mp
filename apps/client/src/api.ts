import { Client, Logger } from "@mp/tsock/client";
import type { ClientContext, ClientState, ServerModules } from "@mp/server";
import { env } from "./env";

export type * as types from "@mp/server";

export const { modules: events, subscribeToState } = new Client<
  ServerModules,
  ClientContext,
  ClientState
>({
  url: env.serverUrl,
  context: () => ({}),
  logger: new Logger(console),
});
