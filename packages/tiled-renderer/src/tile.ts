import { Assets, Sprite } from "@mp/pixi";
import type { ResolvedTile } from "@mp/tiled-decoder";
import type { TiledMap } from "@mp/tiled-loader";

export function createTileSprite(
  { x, y, tile, image }: ResolvedTile,
  map: TiledMap,
): Sprite {
  const s = new Sprite();
  Assets.load(image.image).then((texture) => {
    s.texture = texture;
  });
  return s;
}
