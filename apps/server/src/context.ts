import type { Branded } from "@mp/state";
import type { CharacterId, WorldState } from "./modules/world/schema";

export interface ServerContext {
  clientId: ClientId;
  characterId: CharacterId;
  world: WorldState;
}

export type ClientId = Branded<string, "ClientId">;

export interface ClientContext {}

export type ClientState = WorldState;
