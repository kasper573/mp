import { type TiledResource } from "@mp/excalibur";
import type { DNode } from "./findPath";
import { dNodeFromVector, type DGraph } from "./findPath";

export function dGraphFromTiled(tiled: TiledResource): DGraph {
  const graph: DGraph = {};

  const walkableTiles = tiled.getMatchingTileCoords<boolean>(
    "walkable",
    allTrue,
  );

  for (const tile of walkableTiles) {
    const neighbors: DGraph[DNode] = {};
    for (const neighbor of walkableTiles) {
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

const allTrue = (values: boolean[]) => values.reduce(and);
const and = (a: boolean, b: boolean) => a && b;
