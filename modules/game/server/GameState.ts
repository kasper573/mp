import type { UserIdentity } from "@mp/auth";
import type { PatchStateMachine, SyncServer } from "@mp/sync/server";
import { InjectionContext } from "@mp/ioc";
import type { ActorId, Actor } from "./traits/actor";

export type GameState = {
  actors: Record<ActorId, Actor>;
};

export type GameStateServer = SyncServer<GameState, UserIdentity>;

export const ctx_gameStateMachine =
  InjectionContext.new<PatchStateMachine<GameState>>();
