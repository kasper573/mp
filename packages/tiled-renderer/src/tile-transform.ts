import { Matrix } from "@mp/graphics";
import type { TileLayerTile } from "@mp/tiled-loader";

export function createTileTransform({
  flags,
  x,
  y,
  width,
  height,
}: TileLayerTile): Matrix {
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

  m.translate(x * width, y * height);

  return m;
}
