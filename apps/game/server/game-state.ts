import type { PatchStateMachine } from "@mp/sync";
import { InjectionContext } from "@mp/ioc";
import type { ActorId, Actor } from "./traits/actor";

export type GameState = {
  actors: Record<ActorId, Actor>;
};

export const ctxGameStateMachine =
  InjectionContext.new<PatchStateMachine<GameState>>("GameStateMachine");
