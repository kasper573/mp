import { InjectionContext } from "@mp/ioc";
import type { SyncMap } from "@mp/sync";
import type { Actor, ActorId } from "../actor/actor";
import type { NpcSpawnId } from "../npc/types";

// oxlint-disable-next-line consistent-type-definitions This needs to be a record type, so can't use interface
export type GameState = {
  actors: SyncMap<
    ActorId,
    Actor,
    {
      alive: boolean;
      type: Actor["type"];
      spawnId: NpcSpawnId | undefined;
    }
  >;
};

export const ctxGameState = InjectionContext.new<GameState>("GameState");
