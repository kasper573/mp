import { Sprite } from "@mp/pixi";
import type { ResolvedTile } from "@mp/tiled-decoder";
import type { TextureByGID } from "./spritesheet";

export function createTileSprite(
  { x, y, width, height, gid }: ResolvedTile,
  textureByGID: TextureByGID,
): Sprite {
  return new Sprite({
    x,
    y,
    width,
    height,
    texture: textureByGID(gid),
  });
}
