import { InjectionContext } from "@mp/ioc";
import type { Actor, ActorId } from "./traits/actor";

export type GameState = {
  actors: Map<ActorId, Actor>;
};

export const ctxGameState = InjectionContext.new<GameState>("GameState");
