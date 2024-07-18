import type { ServerRouter, ClientContext } from "@mp/server";
import { createClient as createClientImpl } from "@mp/tsock/client";

export type * from "@mp/server";

export const createClient = createClientImpl<ServerRouter, ClientContext>;
