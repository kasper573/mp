import type { AreaId, ItemContainerId } from "@mp/db/types";
import { object, value, type SyncMap } from "@mp/sync";
import type { Actor, ActorId } from "./actor";
import type { ItemContainer } from "./item";

export const GameStateGlobals = object({
  areaId: value<AreaId>(),
});

export type GameStateGlobals = typeof GameStateGlobals.$infer;

// oxlint-disable-next-line consistent-type-definitions This needs to be a record type, so can't use interface
export type GameState = {
  /**
   * There is only one globals instance,
   * but since all game state must be sync maps,
   * we simply use a sync map with a single key.
   */
  globals: SyncMap<"instance", GameStateGlobals>;
  actors: SyncMap<ActorId, Actor>;
  items: SyncMap<ItemContainerId, ItemContainer>;
};
