import { Matrix, Sprite } from "@mp/pixi";
import type { GlobalIdFlags, TileLayerTile } from "@mp/tiled-loader";
import type { TextureByGID } from "./spritesheet";

export function createTileSprite(
  { id, flags, x, y, width, height }: TileLayerTile,
  textureByGID: TextureByGID,
): Sprite {
  const sprite = new Sprite({
    width,
    height,
    anchor: center,
    texture: textureByGID(id),
  });

  const m = createFlipMatrix(flags);
  m.translate(x * width + width / 2, y * height + height / 2);
  sprite.setFromMatrix(m);

  return sprite;
}

function createFlipMatrix(flags: GlobalIdFlags): Matrix {
  const m = new Matrix();

  if (flags.flippedDiagonally) {
    m.set(0, 1, 1, 0, 0, 0);
  }

  if (flags.flippedHorizontally) {
    m.scale(-1, 1);
  }

  if (flags.flippedVertically) {
    m.scale(1, -1);
  }

  if (flags.rotatedHexagonal120) {
    m.translate(0, -m.ty);
  }
  return m;
}

const center = { x: 0.5, y: 0.5 };
