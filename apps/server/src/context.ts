import type { Branded } from "@mp/data";
import type { AuthToken, AuthServer } from "@mp/auth/server";
import type { Logger } from "@mp/logger";
import type { StateAccess } from "@mp/sync/server";
import type { WorldState } from "./modules/world/schema.ts";
import type { ClientRegistry } from "./modules/world/ClientRegistry.ts";

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

export interface SyncServerConnectionMetaData {
  token: AuthToken;
}
