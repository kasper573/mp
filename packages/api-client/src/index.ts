import type { ServerContext } from "@mp/server";
import { type ServerRouter } from "@mp/server";
import { type Client, createClient } from "@mp/tsock/client";

export type * from "@mp/server";

export type ApiClient = Client<ServerContext, ServerRouter>;

export const createApiClient = createClient<ServerContext, ServerRouter>;
