import type { UserIdentity } from "@mp/auth-server";
import type { SyncServer } from "@mp/sync/server";
import type { CharacterId, Character } from "../character/schema";
import type { NPCId, NPC } from "../npc/schema";

export type WorldState = {
  characters: Record<CharacterId, Character>;
  npcs: Record<NPCId, NPC>;
};

export type WorldSyncServer = SyncServer<WorldState, WorldState, UserIdentity>;
