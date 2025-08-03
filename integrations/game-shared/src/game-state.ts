import type { AreaId } from "@mp/db/types";
import { defineSyncComponent, type SyncMap } from "@mp/sync";
import type { Actor, ActorId } from "./actor";

const Commons = defineSyncComponent((b) => b.add<AreaId>()("id"));

export class GameStateAreaEntity extends Commons {}

// oxlint-disable-next-line consistent-type-definitions This needs to be a record type, so can't use interface
export type GameState = {
  area: SyncMap<"current", GameStateAreaEntity>;
  actors: SyncMap<ActorId, Actor>;
};
