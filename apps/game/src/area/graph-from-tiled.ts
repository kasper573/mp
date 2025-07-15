import { VectorGraph } from "@mp/path-finding";
import type { Tile } from "@mp/std";
import type { TiledResource } from "./tiled-resource";
import { Vector } from "@mp/math";
import type { TileLayerTile } from "@mp/tiled-loader";

export function graphFromTiled(tiled: TiledResource): VectorGraph<Tile> {
  const graph = new VectorGraph<Tile>();

  const walkableTileCoords = getMatchingTileCoords(
    tiled,
    ({ tile }) => tile.properties.get("Walkable")?.value,
    (valuesPerTile) => {
      let walkable = false;
      for (const value of valuesPerTile) {
        if (value === false) {
          return false;
        }
        if (value === true) {
          walkable = true;
        }
      }
      return walkable;
    },
  );

  //tiled.getObjects().filter((obj) => obj.gid !== undefined);

  for (const from of walkableTileCoords) {
    graph.addNode(from);

    for (const to of walkableTileCoords) {
      // Only consider tiles that are one tile away to be neighbors
      // square root of 2 is diagonally adjacent, 1 is orthogonally adjacent
      const distance = from.distance(to);
      if (distance === 1 || distance === Math.SQRT2) {
        graph.addLink(from, to);
      }
    }
  }

  // objects with gid are tile references that are rendered, and thus should be considered
  // for (const candidate of tiled.queryObjects()) {
  //   if (candidate.gid !== undefined {
  //     graph.addNode(tiled.getTile(candidate.gid).coord);
  //   }
  // }

  return graph;
}

function getMatchingTileCoords<T>(
  tiled: TiledResource,
  getValue: (tile: TileLayerTile) => T,
  coordinateTest: (values: NoInfer<T>[]) => boolean,
): Vector<Tile>[] {
  const tilesPerCoordinate = groupBy(
    tiled.tiles().map((layerTile) => ({
      pos: new Vector(layerTile.x, layerTile.y),
      propertyValue: getValue(layerTile),
    })),
    ({ pos: { x, y } }) => `${String(x)}|${String(y)}`,
  );

  const coordinates: Vector<Tile>[] = [];
  for (const tiles of tilesPerCoordinate.values()) {
    const values = tiles.map((t) => t.propertyValue);
    if (coordinateTest(values)) {
      coordinates.push(tiles[0].pos);
    }
  }

  return coordinates;
}
function groupBy<T, K>(array: Iterable<T>, key: (item: T) => K): Map<K, T[]> {
  const map = new Map<K, T[]>();
  for (const item of array) {
    const k = key(item);
    let items = map.get(k);
    if (!items) {
      items = [];
      map.set(k, items);
    }
    items.push(item);
  }
  return map;
}
