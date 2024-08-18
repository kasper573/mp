import { Sprite } from "@mp/pixi";
import type { ResolvedTile } from "@mp/tiled-decoder";
import type { TextureByGID } from "./spritesheet";

export function createTileSprite(
  tile: ResolvedTile,
  textureByGID: TextureByGID,
): Sprite {
  const sprite = new Sprite({
    x: tile.x,
    y: tile.y,
    width: tile.width,
    height: tile.height,
    texture: textureByGID(tile.gid),
  });

  if (tile.flippedHorizontally) {
    sprite.scale.x *= -1;
    sprite.x += tile.width;
  }

  if (tile.flippedVertically) {
    sprite.scale.y *= -1;
    sprite.y += tile.height;
  }

  if (tile.flippedDiagonally) {
    sprite.rotation = Math.PI / 2;
    sprite.x += tile.width;
  }

  if (tile.rotatedHexagonal120) {
    sprite.rotation = (Math.PI / 180) * 120;
  }

  return sprite;
}
