import type { Branded } from "@mp/std";
import type { AuthToken, AuthServer } from "@mp/auth-server";
import type { Logger } from "@mp/logger";
import type { StateAccess } from "@mp/sync/server";
import type { WorldState } from "./WorldState";
import type { ClientRegistry } from "./ClientRegistry";

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
