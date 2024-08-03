import type { WorldState } from "./modules/world/schema";
import type { CharacterId } from "./package";

export interface ServerContext {
  clientId: ClientId;
  world: WorldState;
}

export type ClientId = CharacterId; // TODO should be its distinct type and character id should be derived

export interface ClientContext {}

export type ClientState = WorldState;
