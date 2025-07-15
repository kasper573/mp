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

export function createTileMatrix(t: TileTransform) {
  // 1) figure out flips + rot
  let { width, height } = t;
  let sx = t.flags?.flippedHorizontally ? -1 : 1;
  let sy = t.flags?.flippedVertically ? -1 : 1;
  let rot = t.rotation;
  if (t.flags?.flippedDiagonally) {
    rot += Math.PI / 2;
    [width, height] = [height, width];
    [sx, sy] = [sy, sx];
  }

  // 2) compute the “true” pivot point in world-space
  //    (x,y) is your raw object.x/y; add the fractional origin * size
  const px = t.x + t.originX * width;
  const py = t.y + t.originY * height;

  // 3) standard a/b/c/d from R·S
  const cos = Math.cos(rot),
    sin = Math.sin(rot);
  const a = cos * sx;
  const b = sin * sx;
  const c = -sin * sy;
  const d = cos * sy;

  // 4) figure out the final tx/ty so that
  //    M ⋅ [ox*width, oy*height, 1] = [px,py]
  const ox = t.originX * width,
    oy = t.originY * height;
  const tx = px - (a * ox + c * oy);
  const ty = py - (b * ox + d * oy);

  return [a, b, c, d, tx, ty] as const;
}
