import { VectorGraph } from "@mp/path-finding";
import { upsertMap, type Tile } from "@mp/std";
import type { TiledResource } from "./tiled-resource";
import { Vector } from "@mp/math";
import type { GlobalTileId, TiledObject } from "@mp/tiled-loader";
import type { TileLayerTile } from "@mp/tiled-loader";

export function graphFromTiled(tiled: TiledResource): VectorGraph<Tile> {
  const tilesByGid = new Map<GlobalTileId, TileLayerTile[]>();
  const tilesByCoord = new Map<string, TileLayerTile[]>();
  for (const tile of tiled.tiles) {
    upsertMap(tilesByGid, tile.id, tile);
    upsertMap(tilesByCoord, `${tile.x}|${tile.y}`, tile);
  }

  // The gid in objects refer to tiles that are actually rendered,
  // so we need to consider them for collission as well (if the tile they reference is not walkable)
  const obscuringObjects = new Map<TiledObject, TileLayerTile>();
  for (const obj of tiled.objects.values()) {
    if (obj.gid !== undefined) {
      const referencedTiles = tilesByGid.get(obj.gid);
      if (referencedTiles?.length && !isTileWalkable(...referencedTiles)) {
        obscuringObjects.set(obj, referencedTiles[0]);
      }
    }
  }

  const walkableCoords: Vector<Tile>[] = [];
  for (const tilesAtCoord of tilesByCoord.values()) {
    if (
      isTileWalkable(...tilesAtCoord) &&
      !isObscured(tilesAtCoord[0], obscuringObjects.values())
    ) {
      walkableCoords.push(Vector.from(tilesAtCoord[0]));
    }
  }

  const graph = new VectorGraph<Tile>();
  for (const from of walkableCoords) {
    graph.addNode(from);

    for (const to of walkableCoords) {
      // Only consider tiles that are one tile away to be neighbors
      // square root of 2 is diagonally adjacent, 1 is orthogonally adjacent
      const distance = from.distance(to);
      if (distance === 1 || distance === Math.SQRT2) {
        graph.addLink(from, to);
      }
    }
  }

  return graph;
}

function isObscured(
  tile: TileLayerTile,
  collidingObjects: Iterable<TileLayerTile>,
): boolean {
  return false;
}

function isTileWalkable(...tiles: TileLayerTile[]): boolean {
  let walkable = false;
  for (const tile of tiles) {
    const val = tile.tile.properties.get("Walkable")?.value as
      | boolean
      | undefined;
    if (val === false) {
      return false;
    }
    if (val === true) {
      walkable = true;
    }
  }
  return walkable;
}
