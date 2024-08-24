import { Sprite } from "@mp/pixi";
import type { TileLayerTile } from "@mp/tiled-loader";
import type { TextureByGID } from "./spritesheet";

export function createTileSprite(
  { id, flags, x, y, width, height }: TileLayerTile,
  textureByGID: TextureByGID,
): Sprite {
  const sprite = new Sprite({
    x: x * width,
    y: y * height,
    width,
    height,
    texture: textureByGID(id),
  });

  if (flags.flippedHorizontally) {
    sprite.scale.x *= -1;
    sprite.x += width;
  }

  if (flags.flippedVertically) {
    sprite.scale.y *= -1;
    sprite.y += height;
  }

  if (flags.flippedDiagonally) {
    sprite.rotation = Math.PI / 2;
    sprite.x += width;
  }

  if (flags.rotatedHexagonal120) {
    sprite.rotation = (Math.PI / 180) * 120;
  }

  return sprite;
}
