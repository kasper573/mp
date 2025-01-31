import type { UserIdentity } from "@mp/auth";
import type { SyncServer } from "@mp/sync/server";
import type { CharacterId, Character } from "../character/schema";
import type { NPCInstanceId, NPCInstance } from "../npc/schema";

export type WorldState = {
  characters: Record<CharacterId, Character>;
  npcs: Record<NPCInstanceId, NPCInstance>;
};

export type WorldSyncServer = SyncServer<WorldState, WorldState, UserIdentity>;
