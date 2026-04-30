import { Rect } from "@mp/math";
import type { Tile } from "@mp/std";
import type { ActorModel, ActorModelId } from "@mp/world";

const oneTileBox = new Rect(0 as Tile, 0 as Tile, 1 as Tile, 1 as Tile);

export const actorModels: ReadonlyArray<ActorModel> = [
  { id: "adventurer" as ActorModelId, hitBox: oneTileBox },
];

export const actorModelsById: ReadonlyMap<ActorModelId, ActorModel> = new Map(
  actorModels.map((m) => [m.id, m]),
);
