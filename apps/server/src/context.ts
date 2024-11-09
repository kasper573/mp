import type { Branded } from "@mp/data";
import type { AuthToken, NodeAuthClient } from "@mp/auth/server";
import type { Logger } from "@mp/logger";
import type { StateAccess } from "@mp/sync/server";
import type { WorldState } from "./modules/world/schema";
import type { ClientRegistry } from "./modules/world/ClientRegistry";

export interface ServerContext {
  sessionId: HttpSessionId;
  accessWorldState: StateAccess<WorldState>;
  authToken?: AuthToken;
  auth: NodeAuthClient;
  clients: ClientRegistry;
  logger: Logger;
}

export type HttpSessionId = Branded<string, "HttpSessionId">;
export type { UserId } from "@mp/auth/server";
export type { ClientId } from "@mp/sync/server";

export interface SyncServerConnectionMetaData {
  token: AuthToken;
}
