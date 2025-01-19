import { vec_distance } from "@mp/math";
import type { Graph } from "@mp/path-finding";
import { createNGraph } from "@mp/path-finding";
import { type TiledResource } from "./TiledResource";

export function graphFromTiled(tiled: TiledResource): Graph {
  const graph = createNGraph();

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
    graph.addNode(tile);

    for (const neighbor of walkableTileCoords) {
      // Only consider tiles that are one tile away to be neighbors
      // square root of 2 is diagonally adjacent, 1 is orthogonally adjacent
      const distance = vec_distance(tile, neighbor);
      if (distance === 1 || distance === Math.SQRT2) {
        graph.addLink(tile, neighbor, distance);
      }
    }
  }

  return graph;
}
