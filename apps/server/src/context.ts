import type express from "express";
import type { Branded } from "@mp/std";
import type { AuthToken, AuthServer } from "@mp/auth-server";
import type { Logger } from "@mp/logger";
import type { StateAccess } from "@mp/sync/server";
import type { WorldServer, WorldState } from "./modules/world/WorldState";
import type { ClientRegistry } from "./ClientRegistry";
import { tokenHeaderName } from "./shared";

export interface ServerContext {
  sessionId: HttpSessionId;
  accessWorldState: StateAccess<WorldState>;
  authToken?: AuthToken;
  auth: AuthServer;
  clients: ClientRegistry;
  logger: Logger;
  exposeErrorDetails: boolean;
}

export type HttpSessionId = Branded<string, "HttpSessionId">;

export function createServerContextFactory(
  auth: AuthServer,
  worldState: WorldServer,
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
      accessWorldState: worldState.access,
      authToken,
      auth,
      logger,
      clients,
      exposeErrorDetails,
    };
  };
}
