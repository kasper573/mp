import { VectorGraph } from "@mp/path-finding";
import type { Tile } from "@mp/std";
import { type TiledResource } from "./tiled-resource";

export function graphFromTiled(tiled: TiledResource): VectorGraph<Tile> {
  const graph = new VectorGraph<Tile>();

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
      const distance = from.distance(to);
      if (distance === 1 || distance === Math.SQRT2) {
        graph.addLink(from, to);
      }
    }
  }

  return graph;
}
