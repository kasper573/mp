import type { WorldState } from "./modules/world/schema";
import type { CharacterId } from "./package";

export interface ServerContext {
  clientId: CharacterId;
  world: WorldState;
  time: Date;
}

export interface ClientContext {}

export type ClientState = WorldState;
