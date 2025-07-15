import type { Texture, Mesh, FrameObject } from "@mp/graphics";
import { Container, MeshSimple } from "@mp/graphics";
import type { GlobalTileId } from "@mp/tiled-loader";
import { localToGlobalId, type TileLayerTile } from "@mp/tiled-loader";
import type { TiledTextureLookup } from "./spritesheet";
import type { Branded } from "../../std/src/types";
import { AnimatedMesh } from "./animated-mesh";
import { assert, upsertMap } from "@mp/std";
import type { TileMeshInput } from "./tile-mesh-data";
import { createTileMeshData } from "./tile-mesh-data";

/**
 * Highly performant renderer that groups tiles by their
 * texture or animation and renders them as a single mesh per group.
 *
 * Does not handle any sorting, just brute force rendering.
 * Sorting should be handled by the parent container.
 */
export function createTileRenderer(
  tiles: TileLayerTile[],
  lookupTexture: TiledTextureLookup,
): Container {
  // Group tiles by their texture or animation
  const staticGroups = new Map<GlobalTileId, TileMeshInput[]>();
  const animatedGroups = new Map<AnimationKey, TileMeshInput[]>();
  for (const layerTile of tiles) {
    const meshInput = createTileMeshInput(layerTile);

    if (layerTile.tile.animation) {
      upsertMap(animatedGroups, uniqueAnimationKey(layerTile), meshInput);
    } else {
      upsertMap(staticGroups, layerTile.id, meshInput);
    }
  }

  const tileMap = new Container({ isRenderGroup: true });

  for (const mesh of renderStaticTiles(staticGroups, lookupTexture)) {
    tileMap.addChild(mesh);
  }

  for (const mesh of renderAnimatedTiles(animatedGroups, lookupTexture)) {
    tileMap.addChild(mesh);
  }

  return tileMap;
}

export function* renderStaticTiles(
  staticGroups: Map<GlobalTileId, TileMeshInput[]>,
  lookupTexture: TiledTextureLookup,
): Generator<Mesh> {
  for (const [textureTileId, renderData] of staticGroups) {
    const texture = assert(lookupTexture(textureTileId));
    yield createStaticTileRenderer(texture, renderData);
  }
}

export function* renderAnimatedTiles(
  animatedGroups: Map<AnimationKey, TileMeshInput[]>,
  lookupTexture: TiledTextureLookup,
): Generator<Mesh> {
  for (const [animationId, renderData] of animatedGroups) {
    const tiledFrames = parseAnimationKey(animationId);
    const rendererFrames = tiledFrames.map((f) => ({
      time: f.duration,
      texture: assert(lookupTexture(f.gid)),
    }));
    yield createAnimatedTileRenderer(rendererFrames, renderData);
  }
}

function createStaticTileRenderer(
  texture: Texture,
  tiles: TileMeshInput[],
): Mesh {
  return new MeshSimple({ texture, ...createTileMeshData(tiles) });
}

function createAnimatedTileRenderer(
  frames: FrameObject[],
  tiles: TileMeshInput[],
): Mesh {
  return new AnimatedMesh(frames, createTileMeshData(tiles));
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

function createTileMeshInput({
  flags,
  width,
  height,
  x,
  y,
}: TileLayerTile): TileMeshInput {
  /// 1) figure out flips + rot
  let sx = flags?.flippedHorizontally ? -1 : 1;
  let sy = flags?.flippedVertically ? -1 : 1;
  let rot = 0;

  if (flags?.flippedDiagonally) {
    rot += Math.PI / 2;
    [width, height] = [height, width];
    [sx, sy] = [sy, sx];
  }

  // 2) compute the “true” pivot point in world-space
  const px = x * width + 0.5 * width;
  const py = y * height + 0.5 * height;

  // 3) standard a/b/c/d from R·S
  const cos = Math.cos(rot),
    sin = Math.sin(rot);
  const a = cos * sx;
  const b = sin * sx;
  const c = -sin * sy;
  const d = cos * sy;

  // 4) figure out the final tx/ty so that
  //    M ⋅ [ox*width, oy*height, 1] = [px,py]
  const ox = 0.5 * width,
    oy = 0.5 * height;
  const tx = px - (a * ox + c * oy);
  const ty = py - (b * ox + d * oy);

  return {
    width,
    height,
    transform: [a, b, c, d, tx, ty],
  };
}
