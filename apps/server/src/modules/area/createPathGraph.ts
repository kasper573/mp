import type { TiledResource, VectorLike } from "@mp/excalibur";
import { createNodeId, type PathGraph } from "./findPath";

export function createPathGraph(tiledMap: TiledResource): PathGraph {
  const graph: PathGraph = {};

  const walkableTiles = tiledMap.getMatchingTileCoordinates<boolean>(
    "walkable",
    (values) => values.reduce(and),
  );

  for (const tile of walkableTiles) {
    graph[createNodeId(tile)] = Object.fromEntries(
      walkableTiles
        .filter((candidate) => isOneTileAway(candidate, tile))
        .map((neighbor) => [createNodeId(neighbor), 1]),
    );
  }

  return graph;
}

function isOneTileAway(a: VectorLike, b: VectorLike) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y) === 1;
}

const and = (a: boolean, b: boolean) => a && b;
