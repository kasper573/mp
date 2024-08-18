import { Sprite } from "@mp/pixi";
import type { AssignedTile } from "@mp/tiled-decoder";

export function createTileSprite(tile: AssignedTile): Sprite {
  return new Sprite();
}
