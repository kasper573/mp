import type { UserIdentity } from "@mp/auth-server";
import type { SyncServer } from "@mp/sync-server";
import type { NPCInstance } from "../npc/schema.ts";
import type { Character } from "../character/schema.ts";

export type WorldState = {
  actors: Record<ActorId, Actor>;
};

export type WorldSyncServer = SyncServer<WorldState, UserIdentity>;

export type ActorId = Actor["id"];

export type Actor =
  | ({ type: "character" } & Character)
  | ({ type: "npc" } & NPCInstance);
