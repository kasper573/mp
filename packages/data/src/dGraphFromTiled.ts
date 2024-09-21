import { type TiledResource } from "./TiledResource";
import type { DNode } from "./findPath";
import { dNodeFromVector, type DGraph } from "./findPath";

export function dGraphFromTiled(tiled: TiledResource): DGraph {
  const graph: DGraph = {};

  const walkableTileCoords = tiled.getMatchingTileCoords(
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

  for (const tile of walkableTileCoords) {
    const neighbors: DGraph[DNode] = {};
    for (const neighbor of walkableTileCoords) {
      // Only consider tiles that are one tile away to be neighbors
      // square root of 2 is diagonally adjacent, 1 is orthogonally adjacent
      const distance = tile.distance(neighbor);
      if (distance === 1 || distance === Math.SQRT2) {
        neighbors[dNodeFromVector(neighbor)] = tile.distance(neighbor);
      }
    }
    graph[dNodeFromVector(tile)] = neighbors;
  }

  return graph;
}
