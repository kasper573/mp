import type { Branded } from "@mp/data";
import type { AuthClient } from "@mp/auth/server";
import type { Logger } from "@mp/logger";
import type { StateAccess } from "@mp/sync/server";
import type { WorldState } from "./modules/world/schema";
import type { ClientRegistry } from "./modules/world/ClientRegistry";

export interface ServerContext {
  sessionId: HttpSessionId;
  accessWorldState: StateAccess<WorldState>;
  authToken?: string;
  auth: AuthClient;
  clients: ClientRegistry;
  logger: Logger;
}

export type UserId = Branded<string, "UserId">;
export type HttpSessionId = Branded<string, "HttpSessionId">;
export type { ClientId } from "@mp/sync/server";

export interface SyncServerConnectionMetaData {
  token: string;
}
