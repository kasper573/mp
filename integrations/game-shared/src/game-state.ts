import type { AreaId } from "@mp/db/types";
import { object, value, type SyncMap } from "@mp/sync";
import type { Actor, ActorId } from "./actor";

export const GameServiceArea = object({
  id: value<AreaId>(),
});
export type GameServiceArea = typeof GameServiceArea.$infer;

// oxlint-disable-next-line consistent-type-definitions This needs to be a record type, so can't use interface
export type GameState = {
  area: SyncMap<"current", GameServiceArea>;
  actors: SyncMap<ActorId, Actor>;
};
