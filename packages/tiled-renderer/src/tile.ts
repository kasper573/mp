import { Sprite } from "@mp/pixi";
import type { ResolvedTile } from "@mp/tiled-decoder";
import type { TiledMap } from "@mp/tiled-loader";
import { frameIdForGID, type TiledSpritesheet } from "./spritesheet";

export function createTileSprite(
  { x, y, tile, image }: ResolvedTile,
  map: TiledMap,
  spritesheet: TiledSpritesheet,
): Sprite {
  const texture = spritesheet.textures[frameIdForGID(tile.id)];
  if (!texture) {
    throw new Error(`Spritesheet is missing a texture for tile GID ${tile.id}`);
  }

  return new Sprite({
    x: x * map.tilewidth,
    y: y * map.tileheight,
    width: tile.width ?? map.tilewidth,
    height: tile.height ?? map.tileheight,
    texture,
  });
}
