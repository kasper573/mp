import type { AreaId } from "@mp/db/types";
import { tracked, type SyncMap } from "@mp/sync";
import type { Actor, ActorId } from "./actor";
import { EncoderTag } from "./encoding";

@tracked(EncoderTag.GameServiceArea)
export class GameServiceArea {
  id!: AreaId;
}

// oxlint-disable-next-line consistent-type-definitions This needs to be a record type, so can't use interface
export type GameState = {
  area: SyncMap<"current", GameServiceArea>;
  actors: SyncMap<ActorId, Actor>;
};
