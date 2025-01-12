import type { UserIdentity } from "@mp/auth-server";
import type { SyncServer } from "@mp/sync/server";
import type { CharacterId, Character } from "./modules/character/schema";

export type WorldState = {
  characters: Record<CharacterId, Character>;
};

export type WorldSyncServer = SyncServer<WorldState, WorldState, UserIdentity>;
