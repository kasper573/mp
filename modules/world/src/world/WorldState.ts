import type { UserIdentity } from "@mp/auth";
import type { PatchStateMachine, SyncServer } from "@mp/sync/server";
import { InjectionContext } from "@mp/ioc";
import type { ActorId, Actor } from "../traits/actor";

export type WorldState = {
  actors: Record<ActorId, Actor>;
};

export type WorldSyncServer = SyncServer<WorldState, UserIdentity>;

export const ctx_worldStateMachine =
  InjectionContext.new<PatchStateMachine<WorldState>>();
