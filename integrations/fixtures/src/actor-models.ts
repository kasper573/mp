import { Rect } from "@mp/math";
import type { Tile } from "@mp/std";
import type { ActorModel, ActorModelId } from "@mp/world";

// Sprite anchor is (0.5, 2/3) at the actor's tile coords (its feet).
const adventurerHitBox = new Rect(
  -0.5 as Tile,
  -1.5 as Tile,
  1 as Tile,
  2 as Tile,
);

export const actorModels: ReadonlyArray<ActorModel> = [
  { id: "adventurer" as ActorModelId, hitBox: adventurerHitBox },
];

export const actorModelsById: ReadonlyMap<ActorModelId, ActorModel> = new Map(
  actorModels.map((m) => [m.id, m]),
);
