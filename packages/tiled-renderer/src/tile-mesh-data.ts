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

  // 4 verts per tile, 2 components (x,y) each
  const vertices = new Float32Array(N * 4 * 2);
  // same size for UVs
  const uvs = new Float32Array(N * 4 * 2);
  // 6 indices per quad
  const indices = new Uint32Array(N * 6);

  // Normalized UV pattern for a full-texture quad
  const uvPattern = [0, 0, 1, 0, 1, 1, 0, 1];

  for (let i = 0; i < N; i++) {
    const { width, height } = tiles[i];
    const { a, b, c, d, tx, ty } = createTileTransform(tiles[i]);

    // Transform the four corners of a rectangle [0,0]→[width,height]
    const vOff = i * 8;
    vertices[vOff] = tx; // x0
    vertices[vOff + 1] = ty; // y0
    vertices[vOff + 2] = a * width + tx; // x1
    vertices[vOff + 3] = b * width + ty; // y1
    vertices[vOff + 4] = a * width + c * height + tx; // x2
    vertices[vOff + 5] = b * width + d * height + ty; // y2
    vertices[vOff + 6] = c * height + tx; // x3
    vertices[vOff + 7] = d * height + ty; // y3

    // copy the same normalized UVs for each tile
    uvs.set(uvPattern, vOff);

    const iOff = i * 6;
    const base = i * 4;
    // two triangles: (0,1,2) and (0,2,3)
    indices[iOff] = base;
    indices[iOff + 1] = base + 1;
    indices[iOff + 2] = base + 2;
    indices[iOff + 3] = base;
    indices[iOff + 4] = base + 2;
    indices[iOff + 5] = base + 3;
  }

  return { vertices, uvs, indices };
}

function createTileTransform({
  x,
  y,
  flags,
  rotation = 0,
}: TileRenderData): Matrix {
  const m = new Matrix();

  // 1) Build the flip‐swap matrix F
  let sx = 1,
    sy = 1,
    swap = false;
  if (flags?.flippedDiagonally) swap = true;
  if (flags?.flippedHorizontally) sx = -1;
  if (flags?.flippedVertically) sy = -1;

  // Tiled “diagonal” flip = reflect across y=x ⟹ swap axes:
  const aF = swap ? 0 : sx;
  const bF = swap ? sy : 0;
  const cF = swap ? sx : 0;
  const dF = swap ? 0 : sy;
  const F = new Matrix(aF, bF, cF, dF, 0, 0);

  // 2) Rotation matrix R:
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  const R = new Matrix(cos, sin, -sin, cos, 0, 0);

  // 3) Translation T:
  const T = new Matrix(1, 0, 0, 1, x, y);

  // Prepend builds M = T·R·F·I
  m.prepend(F).prepend(R).prepend(T);

  return m;
}
