import type express from "npm:express";
import type { Branded } from "@mp/std";
import type { AuthServer } from "@mp/auth-server";
import type { Logger } from "@mp/logger";
import type { AuthToken } from "@mp/auth-server";
import type { ClientRegistry } from "./ClientRegistry.ts";
import { tokenHeaderName } from "./shared.ts";

export interface ServerContext {
  sessionId: HttpSessionId;
  authToken?: AuthToken;
  auth: AuthServer;
  clients: ClientRegistry;
  logger: Logger;
  exposeErrorDetails: boolean;
}

export type HttpSessionId = Branded<string, "HttpSessionId">;

export function createServerContextFactory(
  auth: AuthServer,
  clients: ClientRegistry,
  logger: Logger,
  exposeErrorDetails: boolean,
) {
  return function createServerContext({
    req,
  }: {
    req: express.Request;
  }): ServerContext {
    const sessionId = `${req.ip}-${req.headers["user-agent"]}` as HttpSessionId;
    const authToken = String(
      req.headers[tokenHeaderName],
    ) as ServerContext["authToken"];
    return {
      sessionId,
      authToken,
      auth,
      logger,
      clients,
      exposeErrorDetails,
    };
  };
}
