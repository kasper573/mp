import { InjectionContext } from "@mp/ioc";
import type { SyncMap } from "@mp/sync";
import type { Actor, ActorId } from "../actor/actor";

// oxlint-disable-next-line consistent-type-definitions This needs to be a record type, so can't use interface
export type GameState = {
  actors: SyncMap<ActorId, Actor>;
};

export const ctxGameState = InjectionContext.new<GameState>("GameState");
