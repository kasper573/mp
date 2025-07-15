import type { Texture, Mesh, FrameObject } from "@mp/graphics";
import { Container, MeshSimple } from "@mp/graphics";
import type { GlobalTileId, TileTransform } from "@mp/tiled-loader";
import { localToGlobalId, type TileLayerTile } from "@mp/tiled-loader";
import type { TiledTextureLookup } from "./spritesheet";
import type { Branded } from "../../std/src/types";
import { AnimatedMesh } from "./animated-mesh";
import { assert, upsertMap } from "@mp/std";
import { createTileMeshData } from "./tile-mesh-data";

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
  const staticGroups = new Map<GlobalTileId, TileTransform[]>();
  const animatedGroups = new Map<AnimationKey, TileTransform[]>();
  for (const layerTile of tiles) {
    const renderData: TileTransform = {
      x: layerTile.x * layerTile.width,
      y: layerTile.y * layerTile.height,
      width: layerTile.width,
      height: layerTile.height,
      flags: layerTile.flags,
      originX: 0.5,
      originY: 0.5,
      rotation: 0,
    };

    if (layerTile.tile.animation) {
      upsertMap(animatedGroups, uniqueAnimationKey(layerTile), renderData);
    } else {
      upsertMap(staticGroups, layerTile.id, renderData);
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
  staticGroups: Map<GlobalTileId, TileTransform[]>,
  lookupTexture: TiledTextureLookup,
): Generator<Mesh> {
  for (const [textureTileId, renderData] of staticGroups) {
    const texture = assert(lookupTexture(textureTileId));
    yield createStaticTileRenderer(texture, renderData);
  }
}

export function* renderAnimatedTiles(
  animatedGroups: Map<AnimationKey, TileTransform[]>,
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
  tiles: TileTransform[],
): Mesh {
  return new MeshSimple({ texture, ...createTileMeshData(tiles) });
}

function createAnimatedTileRenderer(
  frames: FrameObject[],
  tiles: TileTransform[],
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
