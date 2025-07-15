import type { MatrixData } from "@mp/math";

export interface TileMeshInput {
  width: number;
  height: number;
  transform: MatrixData;
}

export function createTileMeshData(tiles: TileMeshInput[]) {
  const N = tiles.length;

  const vertices = new Float32Array(N * 4 * 2);
  const uvs = new Float32Array(N * 4 * 2);
  const indices = new Uint32Array(N * 6);

  // standard [0,0],[1,0],[1,1],[0,1]
  const uvPattern = [0, 0, 1, 0, 1, 1, 0, 1];

  for (let i = 0; i < N; i++) {
    // build a transform matrix that:
    //  • translates to (dx,dy)
    //  • rotates by (rotation + optional 90° if diagonal)
    //  • then scales by (±1, ±1) to do the horizontal/vertical flips
    const tile = tiles[i];
    const [a, b, c, d, tx, ty] = tile.transform;

    // now lay out our quad at origin [0,0]→[width,height], *then*
    // transform with our 2×3 matrix (a,b,c,d,tx,ty)
    const { width, height } = tile;
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
