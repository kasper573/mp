import { InjectionContext } from "@mp/ioc";
import type { SyncMap } from "@mp/sync";
import type { Actor, ActorId } from "./actor";

export type GameState = {
  actors: SyncMap<ActorId, Actor>;
};

export const ctxGameState = InjectionContext.new<GameState>("GameState");
