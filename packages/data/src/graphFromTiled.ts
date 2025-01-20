import { vec_distance } from "@mp/math";
import { VectorGraph } from "@mp/path-finding";
import { type TiledResource } from "./TiledResource";

export function graphFromTiled(tiled: TiledResource): VectorGraph {
  const graph = new VectorGraph();

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

  for (const from of walkableTileCoords) {
    graph.addNode(from);

    for (const to of walkableTileCoords) {
      // Only consider tiles that are one tile away to be neighbors
      // square root of 2 is diagonally adjacent, 1 is orthogonally adjacent
      const distance = vec_distance(from, to);
      if (distance === 1 || distance === Math.SQRT2) {
        graph.addLink(from, to);
      }
    }
  }

  return graph;
}
