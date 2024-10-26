import type { Branded } from "@mp/data";
import type { AuthClient } from "@mp/auth/server";
import type { Logger } from "@mp/logger";
import type { StateAccess } from "@mp/transformer";
import type { WorldState } from "./modules/world/schema";
import type { ClientRegistry } from "./modules/world/ClientRegistry";

export interface ServerContext {
  accessWorldState: StateAccess<WorldState>;
  headers?: Record<string, string | undefined | null>;
  clientId?: ClientId;
  auth: AuthClient;
  clients: ClientRegistry;
  logger: Logger;
}

export type ClientId = Branded<string, "ClientId">;
