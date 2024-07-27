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
  const dx = Math.abs(a.x - b.x);
  const dy = Math.abs(a.y - b.y);
  const isDiagonal = dx === 1 && dy === 1;
  return dx + dy === 1 || isDiagonal;
}

const and = (a: boolean, b: boolean) => a && b;
