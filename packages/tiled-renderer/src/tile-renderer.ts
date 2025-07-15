import type { Texture, Matrix, Mesh, FrameObject } from "@mp/graphics";
import { Container, MeshSimple } from "@mp/graphics";
import type { GlobalTileId } from "@mp/tiled-loader";
import { localToGlobalId, type TileLayerTile } from "@mp/tiled-loader";
import type { TiledTextureLookup } from "./spritesheet";
import { createTileTransform } from "./tile-transform";
import type { Branded } from "../../std/src/types";
import { AnimatedMesh } from "./animated-mesh";
import { assert } from "@mp/std";

/**
 * "dumb" but highly performant renderer that groups tiles by their
 * texture or animation and renders them as a single mesh.
 *
 * Does not handle any sorting, just brute force rendering.
 * Sorting should be handled by the parent container.
 */
export function createTileRenderer(
  tiles: TileLayerTile[],
  lookupTexture: TiledTextureLookup,
): Container {
  // Group tiles by their texture or animation
  const staticGroups = new Map<GlobalTileId, TileRenderData[]>();
  const animatedGroups = new Map<AnimationKey, TileRenderData[]>();
  for (const layerTile of tiles) {
    const renderData: TileRenderData = {
      width: layerTile.width,
      height: layerTile.height,
      transform: createTileTransform(layerTile),
    };

    if (layerTile.tile.animation) {
      upsertMap(animatedGroups, uniqueAnimationKey(layerTile), renderData);
    } else {
      upsertMap(staticGroups, layerTile.id, renderData);
    }
  }

  const tileMap = new Container({ isRenderGroup: true });

  for (const [textureTileId, renderData] of staticGroups) {
    const texture = assert(lookupTexture(textureTileId));
    tileMap.addChild(createStaticTileRenderer(texture, renderData));
  }

  for (const [animationId, renderData] of animatedGroups) {
    const tiledFrames = parseAnimationKey(animationId);
    const rendererFrames = tiledFrames.map((f) => ({
      time: f.duration,
      texture: assert(lookupTexture(f.gid)),
    }));
    tileMap.addChild(createAnimatedTileRenderer(rendererFrames, renderData));
  }

  return tileMap;
}

function createStaticTileRenderer(
  texture: Texture,
  tiles: TileRenderData[],
): Container {
  return new MeshSimple({ texture, ...createMeshInput(tiles) });
}

function createAnimatedTileRenderer(
  frames: FrameObject[],
  tiles: TileRenderData[],
): Mesh {
  return new AnimatedMesh(frames, createMeshInput(tiles));
}

interface TileRenderData {
  width: number;
  height: number;
  transform: Matrix;
}

/**
 * AI code. I don't understand shaders enough to know if the code or comments are sane,
 * but it seems reasonable and it works.
 */
function createMeshInput(tiles: TileRenderData[]) {
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
    const { width, height, transform } = tiles[i];
    const { a, b, c, d, tx, ty } = transform;

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

function upsertMap<K, V>(map: Map<K, V[]>, key: K, value: V): void {
  if (map.has(key)) {
    map.get(key)?.push(value);
  } else {
    map.set(key, [value]);
  }
}

type AnimationKey = Branded<string, "AnimationKey">;

interface AnimationIdData {
  gid: GlobalTileId;
  duration: number;
}

function uniqueAnimationKey(tile: TileLayerTile): AnimationKey {
  return JSON.stringify(
    (tile.tile.animation ?? []).map(
      (f): AnimationIdData => ({
        gid: localToGlobalId(tile.tileset.firstgid, f.tileid),
        duration: f.duration,
      }),
    ),
  ) as AnimationKey;
}

function parseAnimationKey(id: AnimationKey): AnimationIdData[] {
  return JSON.parse(id) as AnimationIdData[];
}
