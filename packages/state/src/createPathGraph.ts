import { type TiledResource } from "@mp/excalibur";
import type { PathGraphNodeId } from "./findPath";
import { createNodeId, type PathGraph } from "./findPath";

export function createPathGraph(tiledMap: TiledResource): PathGraph {
  const graph: PathGraph = {};

  const walkableTiles = tiledMap.getMatchingTileCoordinates<boolean>(
    "walkable",
    allTrue,
  );

  for (const tile of walkableTiles) {
    const neighbors: PathGraph[PathGraphNodeId] = {};
    for (const neighbor of walkableTiles) {
      // Only consider tiles that are one tile away to be neighbors
      // square root of 2 is diagonally adjacent, 1 is orthogonally adjacent
      const distance = tile.distance(neighbor);
      if (distance === 1 || distance === Math.SQRT2) {
        neighbors[createNodeId(neighbor)] = tile.distance(neighbor);
      }
    }
    graph[createNodeId(tile)] = neighbors;
  }

  return graph;
}

const allTrue = (values: boolean[]) => values.reduce(and);
const and = (a: boolean, b: boolean) => a && b;
