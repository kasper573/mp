import type { Branded } from "@mp/data";
import type { AuthClient } from "@mp/auth/server";
import type { Logger } from "@mp/logger";
import type { WorldState } from "./modules/world/schema";
import type { ClientRegistry } from "./modules/world/ClientRegistry";
import type { StateAccess, StateUpdate } from "./state";

export interface ServerContext {
  accessWorldState: StateAccess<WorldState>;
  headers?: Record<string, string | undefined | null>;
  clientId?: ClientId;
  auth: AuthClient;
  clients: ClientRegistry;
  logger: Logger;
}

export type ClientId = Branded<string, "ClientId">;

export type ClientState = WorldState;

export type ClientStateUpdate = StateUpdate;
