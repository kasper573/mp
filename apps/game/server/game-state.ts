import { InjectionContext } from "@mp/ioc";
import type { Actor, ActorId } from "./actor";

export type GameState = {
  actors: Record<ActorId, Actor>;
};

export const ctxGameState = InjectionContext.new<GameState>("GameState");
