import type { Texture, Mesh, FrameObject } from "@mp/graphics";
import { MeshSimple } from "@mp/graphics";
import type {
  Frame,
  GlobalTileId,
  TileAnimationKey,
  Tileset,
} from "@mp/tiled-loader";
import { localToGlobalId, type TileLayerTile } from "@mp/tiled-loader";
import type { TiledTextureLookup } from "./spritesheet";
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
export function* renderLayerTiles(
  tiles: TileLayerTile[],
  lookupTexture: TiledTextureLookup,
): Generator<Mesh> {
  // Group tiles by their texture or animation
  const staticGroups = new Map<GlobalTileId, TileMeshInput[]>();
  const animatedGroups = new Map<TileAnimationKey, TileMeshInput[]>();
  const animationFrames = new Map<TileAnimationKey, AnimationFrame[]>();
  for (const layerTile of tiles) {
    const meshInput = createTileMeshInput(layerTile);

    if (layerTile.tile.animation) {
      upsertMap(animatedGroups, layerTile.tile.animation.key, meshInput);
      if (!animationFrames.has(layerTile.tile.animation.key)) {
        animationFrames.set(
          layerTile.tile.animation.key,
          tilesetFramesToAnimationFrames(
            layerTile.tileset,
            layerTile.tile.animation.frames,
          ),
        );
      }
    } else {
      upsertMap(staticGroups, layerTile.id, meshInput);
    }
  }

  yield* renderStaticTiles(staticGroups, lookupTexture);
  yield* renderAnimatedTiles(animatedGroups, animationFrames, lookupTexture);
}

export function* renderStaticTiles(
  staticGroups: Map<GlobalTileId, TileMeshInput[]>,
  lookupTexture: TiledTextureLookup,
): Generator<Mesh> {
  for (const [textureTileId, meshInput] of staticGroups) {
    const texture = assert(lookupTexture(textureTileId));
    yield renderStaticTile(texture, meshInput);
  }
}

export function* renderAnimatedTiles(
  animatedGroups: ReadonlyMap<TileAnimationKey, TileMeshInput[]>,
  animationFrames: ReadonlyMap<TileAnimationKey, AnimationFrame[]>,
  lookupTexture: TiledTextureLookup,
): Generator<Mesh> {
  for (const [animationKey, meshInput] of animatedGroups) {
    const frames = assert(animationFrames.get(animationKey));
    const frameObjects = frames.map((f) => ({
      time: f.duration,
      texture: assert(lookupTexture(f.gid)),
    }));
    yield renderAnimatedTile(frameObjects, meshInput);
  }
}

export function renderStaticTile(
  texture: Texture,
  tiles: TileMeshInput[],
): Mesh {
  return new MeshSimple({ texture, ...createTileMeshData(tiles) });
}

export function renderAnimatedTile(
  frames: FrameObject[],
  tiles: TileMeshInput[],
): Mesh {
  return new AnimatedMesh(frames, createTileMeshData(tiles));
}

interface AnimationFrame {
  gid: GlobalTileId;
  duration: number;
}

function tilesetFramesToAnimationFrames(
  tileset: Tileset,
  tilesetFrames: Frame[],
): AnimationFrame[] {
  return tilesetFrames.map(
    (f): AnimationFrame => ({
      gid: localToGlobalId(tileset.firstgid, f.tileid),
      duration: f.duration,
    }),
  );
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
