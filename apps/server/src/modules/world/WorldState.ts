import type { UserIdentity } from "@mp/auth-server";
import type { SyncServer } from "@mp/sync/server";
import type { CharacterId, Character } from "../character/schema";

export type WorldState = {
  characters: Record<CharacterId, Character>;
};

export type WorldServer = SyncServer<WorldState, WorldState, UserIdentity>;
