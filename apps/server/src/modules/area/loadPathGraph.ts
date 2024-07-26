import type { TiledResource, VectorLike } from "@mp/excalibur";
import { createNodeId, type PathGraph } from "./findPath";

export async function loadPathGraph(
  tiledMap: TiledResource,
): Promise<PathGraph> {
  await tiledMap.load();

  const graph: PathGraph = {};

  const walkableTiles = tiledMap.getTilesByProperty("walkable", true);

  for (const tile of walkableTiles) {
    const neighborTiles = walkableTiles.filter((candidate) =>
      isOneTileAway(candidate.exTile, tile.exTile),
    );
    graph[createNodeId(tile.exTile)] = Object.fromEntries(
      neighborTiles.map((tile) => [createNodeId(tile.exTile), 1]),
    );
  }

  return graph;
}

function isOneTileAway(a: VectorLike, b: VectorLike) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y) === 1;
}
