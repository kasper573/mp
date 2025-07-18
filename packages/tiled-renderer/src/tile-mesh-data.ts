import type { MatrixData } from "@mp/math";

export interface TileMeshInput {
  width: number;
  height: number;
  transform: MatrixData;
}

// typed UV template
const uvPattern = new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]);

export function createTileMeshData(tiles: TileMeshInput[]) {
  const N = tiles.length;
  const vertices = new Float32Array(N * 4 * 2);
  const uvs = new Float32Array(N * 4 * 2);
  const indices = new Uint32Array(N * 6);

  // running offsets
  let vOff = 0; // += 8
  let uvOff = 0; // += 8
  let iOff = 0; // += 6
  let base = 0; // += 4

  for (let i = 0; i < N; i++) {
    const { width, height, transform } = tiles[i];
    const [a, b, c, d, tx, ty] = transform;

    // lay out quad + transform
    vertices[vOff + 0] = tx;
    vertices[vOff + 1] = ty;
    vertices[vOff + 2] = a * width + tx;
    vertices[vOff + 3] = b * width + ty;
    vertices[vOff + 4] = a * width + c * height + tx;
    vertices[vOff + 5] = b * width + d * height + ty;
    vertices[vOff + 6] = c * height + tx;
    vertices[vOff + 7] = d * height + ty;

    // copy UVs via typed-array set (fast memcpy)
    uvs.set(uvPattern, uvOff);

    // two triangles
    indices[iOff + 0] = base + 0;
    indices[iOff + 1] = base + 1;
    indices[iOff + 2] = base + 2;
    indices[iOff + 3] = base + 0;
    indices[iOff + 4] = base + 2;
    indices[iOff + 5] = base + 3;

    // advance all offsets
    vOff += 8;
    uvOff += 8;
    iOff += 6;
    base += 4;
  }

  return { vertices, uvs, indices };
}
