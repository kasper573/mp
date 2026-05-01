import { Rect } from "@mp/math";
import type { Tile } from "@mp/std";
import type { ActorModel, ActorModelId } from "@mp/world";

// Model-space hitbox for the adventurer sprite. The sprite is drawn with
// its horizontal centre and ~2/3 vertical anchor at the actor's tile
// coords (its feet), so the hitbox extends one tile up from the feet and
// half a tile below to cover the foot/shadow area. Combined with
// `Movement.coords` at hit-test time via `hitBox.offset(coords)`.
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
