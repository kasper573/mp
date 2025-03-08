import type { UserIdentity } from "@mp/auth";
import type { PatchStateMachine, SyncServer } from "@mp/sync/server";
import { InjectionContext } from "@mp/ioc";
import type { NPCInstance } from "../npc/schema";
import type { Character } from "../character/schema";

export type WorldState = {
  actors: Record<ActorId, Actor>;
};

export type WorldSyncServer = SyncServer<WorldState, UserIdentity>;

export type ActorId = Actor["id"];

export type Actor =
  | ({ type: "character" } & Character)
  | ({ type: "npc" } & NPCInstance);

export const ctx_worldStateMachine =
  InjectionContext.new<PatchStateMachine<WorldState>>();
