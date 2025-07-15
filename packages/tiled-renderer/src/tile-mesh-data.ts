import { Matrix } from "@mp/graphics";
import type { Pixel } from "@mp/std";
import type { GlobalIdFlags } from "@mp/tiled-loader";

export interface TileRenderData {
  width: Pixel;
  height: Pixel;
  x: Pixel;
  y: Pixel;
  flags?: GlobalIdFlags;
  rotation?: number; // Radians
}

export function createTileMeshData(tiles: TileRenderData[]) {
  const N = tiles.length;

  const vertices = new Float32Array(N * 4 * 2);
  const uvs = new Float32Array(N * 4 * 2);
  const indices = new Uint32Array(N * 6); // Uint16 is sufficient unless you truly exceed 65535 verts

  // standard [0,0],[1,0],[1,1],[0,1]
  const uvPattern = [0, 0, 1, 0, 1, 1, 0, 1];

  for (let i = 0; i < N; i++) {
    // build a transform matrix that:
    //  • translates to (dx,dy)
    //  • rotates by (rotation + optional 90° if diagonal)
    //  • then scales by (±1, ±1) to do the horizontal/vertical flips
    const { a, b, c, d, tx, ty } = createTileTransform(tiles[i]);

    // now lay out our quad at origin [0,0]→[width,height], *then*
    // transform with our 2×3 matrix (a,b,c,d,tx,ty)
    const { width, height } = tiles[i];
    const vOff = i * 8;
    vertices[vOff + 0] = tx;
    vertices[vOff + 1] = ty;
    vertices[vOff + 2] = a * width + tx;
    vertices[vOff + 3] = b * width + ty;
    vertices[vOff + 4] = a * width + c * height + tx;
    vertices[vOff + 5] = b * width + d * height + ty;
    vertices[vOff + 6] = c * height + tx;
    vertices[vOff + 7] = d * height + ty;

    // UVs stay the same
    uvs.set(uvPattern, vOff);

    // two triangles per quad
    const iOff = i * 6;
    const base = i * 4;
    indices[iOff + 0] = base + 0;
    indices[iOff + 1] = base + 1;
    indices[iOff + 2] = base + 2;
    indices[iOff + 3] = base + 0;
    indices[iOff + 4] = base + 2;
    indices[iOff + 5] = base + 3;
  }

  return { vertices, uvs, indices };
}

export function createTileTransform({
  width,
  height,
  x,
  y,
  flags,
  rotation = 0,
}: TileRenderData): Matrix {
  // base translate target:
  let dx: number = x;
  let dy: number = y;

  // start with any diagonal flip: that is really a 90° (π/2) rotation plus
  // swapping your width/height *and* swapping which axis you flip for H/V.
  let rot = rotation;
  let sx = flags?.flippedHorizontally ? -1 : 1;
  let sy = flags?.flippedVertically ? -1 : 1;

  if (flags?.flippedDiagonally) {
    // rotate tile by +90°
    rot += Math.PI / 2;
    // swap dimensions
    [width, height] = [height, width];
    // swap your H/V scale
    [sx, sy] = [sy, sx];
  }

  // now if either scale is negative, we need to shift the origin
  // by the full width/height so that the flip happens *about* the cell,
  // not off into the void.
  if (sx < 0) dx += width;
  if (sy < 0) dy += height;

  // build our M = T · R · S
  const T = new Matrix(1, 0, 0, 1, dx, dy);
  const cos = Math.cos(rot);
  const sin = Math.sin(rot);
  const R = new Matrix(cos, sin, -sin, cos, 0, 0);
  const S = new Matrix(sx, 0, 0, sy, 0, 0);

  // append order: this = T × R × S
  return new Matrix()
    .prepend(S) // S
    .prepend(R) // R · S
    .prepend(T); // T · R · S
}
