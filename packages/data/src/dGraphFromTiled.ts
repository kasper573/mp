import { vec_distance } from "@mp/math";
import type { TiledResource } from "./TiledResource.ts";
import type { DNode } from "./findPath.ts";
import { dNodeFromVector, type DGraph } from "./findPath.ts";

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
    }
  );

  for (const tile of walkableTileCoords) {
    const neighbors: DGraph[DNode] = {};
    for (const neighbor of walkableTileCoords) {
      // Only consider tiles that are one tile away to be neighbors
      // square root of 2 is diagonally adjacent, 1 is orthogonally adjacent
      const distance = vec_distance(tile, neighbor);
      if (distance === 1 || distance === Math.SQRT2) {
        neighbors[dNodeFromVector(neighbor)] = vec_distance(tile, neighbor);
      }
    }
    graph[dNodeFromVector(tile)] = neighbors;
  }

  return graph;
}
