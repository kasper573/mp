import { InjectionContext } from "@mp/ioc";
import type { SyncMap } from "@mp/sync";
import type { Actor, ActorId } from "../actor/actor";
import type { NpcSpawnId } from "../npc/types";
import type { AreaId } from "../area/area-id";

// oxlint-disable-next-line consistent-type-definitions This needs to be a record type, so can't use interface
export type GameState = {
  area: SyncMap<"current", { id: AreaId }>;
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
