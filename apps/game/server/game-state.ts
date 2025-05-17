import type { SyncStateMachine } from "@mp/sync";
import { InjectionContext } from "@mp/ioc";
import type { ActorId, Actor } from "./traits/actor";
import type { GameStateEvents } from "./game-state-events";

export type GameState = {
  actors: Record<ActorId, Actor>;
};

export type GameStateMachine = SyncStateMachine<GameState, GameStateEvents>;

export const ctxGameStateMachine =
  InjectionContext.new<GameStateMachine>("GameStateMachine");
