import { VectorGraph } from "@mp/path-finding";
import type { Tile } from "@mp/std";
import type { TiledResource } from "./tiled-resource";
import { Vector } from "@mp/math";
import type { TiledMap } from "@mp/tiled-loader";
import { WalkableChecker } from "./tiled-walkable-checker";

export function graphFromTiled(tiled: TiledResource): VectorGraph<Tile> {
  const graph = new VectorGraph<Tile>();
  const walkableCoords = new Map<string, Vector<Tile>>();
  const walkableChecker = new WalkableChecker(tiled);
  for (const tileCoord of gridCoords(tiled.map)) {
    if (walkableChecker.isWalkable(tileCoord)) {
      walkableCoords.set(tileCoord.key, tileCoord);
      graph.addNode(tileCoord);
    }
  }

  for (const coord of walkableCoords.values()) {
    for (const [offsetX, offsetY] of neighborOffsets) {
      const neighborKey = Vector.key(coord.x + offsetX, coord.y + offsetY);
      const from = walkableCoords.get(coord.key);
      const to = walkableCoords.get(neighborKey);
      if (from && to) {
        graph.addLink(from, to);
      }
    }
  }

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

function* gridCoords(map: TiledMap): Generator<Vector<Tile>> {
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      yield new Vector(x as Tile, y as Tile);
    }
  }
}
