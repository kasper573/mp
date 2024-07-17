import type { ServerContext } from "@mp/server";
import { type ServerRouter } from "@mp/server";
import { Client } from "@mp/tsock/client";

export type * from "@mp/server";

export class ApiClient extends Client<ServerContext, ServerRouter> {}
