import { VectorGraph } from "@mp/path-finding";
import type { Tile } from "@mp/std";
import type { TiledResource } from "./tiled-resource";
import { Vector } from "@mp/math";
import { WalkableChecker } from "./tiled-walkable-checker";

export function graphFromTiled(tiled: TiledResource): VectorGraph<Tile> {
  const graph = new VectorGraph<Tile>();
  const walkableChecker = new WalkableChecker(tiled);

  graph.beginUpdate();
  for (const from of walkableChecker.walkableCoords.values()) {
    graph.addNode(from);
    for (const [offsetX, offsetY] of neighborOffsets) {
      const neighborKey = Vector.key(from.x + offsetX, from.y + offsetY);
      const to = walkableChecker.walkableCoords.get(neighborKey);
      if (to) {
        graph.addLink(from, to);
      }
    }
  }
  graph.endUpdate();

  return graph;
}

const neighborOffsets: [number, number][] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];
