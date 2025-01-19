import { vec, vec_distance } from "@mp/math";
import { type TiledResource } from "./TiledResource";
import { createGraph, nodeIdFromVector, type Graph } from "./findPath";

export function graphFromTiled(tiled: TiledResource): Graph {
  const graph = createGraph();

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
    const vector = vec(tile.x, tile.y);
    const tileNodeId = nodeIdFromVector(vector);
    graph.addNode(tileNodeId, { vector });

    for (const neighbor of walkableTileCoords) {
      // Only consider tiles that are one tile away to be neighbors
      // square root of 2 is diagonally adjacent, 1 is orthogonally adjacent
      const distance = vec_distance(tile, neighbor);
      if (distance === 1 || distance === Math.SQRT2) {
        graph.addLink(tileNodeId, nodeIdFromVector(neighbor), {
          weight: distance,
        });
      }
    }
  }

  return graph;
}
