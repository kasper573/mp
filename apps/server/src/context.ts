import type { Branded } from "@mp/state";
import type { CharacterId, WorldState } from "./modules/world/schema";

export interface ServerContext {
  clientId: ClientId;
  characterId: CharacterId;
  world: WorldState;
}

export interface ClientContext {}

export type ClientId = Branded<string, "ClientId">;

export type ClientState = WorldState;

export type ClientStateUpdate = WorldState;
