import type { GlobalIdFlags } from "./gid";

export interface TileTransform {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number; // Radians
  originX: number; // Fractional origin in [0,1] range
  originY: number; // Fractional origin in [0,1] range
  flags?: GlobalIdFlags;
}

export function createTileMatrix({
  x,
  y,
  width,
  height,
  rotation,
  originX,
  originY,
  flags,
}: TileTransform) {
  // 1) figure out flips + rot
  let sx = flags?.flippedHorizontally ? -1 : 1;
  let sy = flags?.flippedVertically ? -1 : 1;
  let rot = rotation;
  if (flags?.flippedDiagonally) {
    rot += Math.PI / 2;
    [width, height] = [height, width];
    [sx, sy] = [sy, sx];
  }

  // 2) compute the “true” pivot point in world-space
  //    (x,y) is your raw object.x/y; add the fractional origin * size
  const px = x + originX * width;
  const py = y + originY * height;

  // 3) standard a/b/c/d from R·S
  const cos = Math.cos(rot),
    sin = Math.sin(rot);
  const a = cos * sx;
  const b = sin * sx;
  const c = -sin * sy;
  const d = cos * sy;

  // 4) figure out the final tx/ty so that
  //    M ⋅ [ox*width, oy*height, 1] = [px,py]
  const ox = originX * width,
    oy = originY * height;
  const tx = px - (a * ox + c * oy);
  const ty = py - (b * ox + d * oy);

  return [a, b, c, d, tx, ty] as const;
}
