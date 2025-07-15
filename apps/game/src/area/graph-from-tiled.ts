import { VectorGraph } from "@mp/path-finding";
import type { Branded } from "@mp/std";
import { upsertMap, type Tile } from "@mp/std";
import { TiledResource } from "./tiled-resource";
import type { VectorLike } from "@mp/math";
import { Rect } from "@mp/math";
import { Vector } from "@mp/math";
import type { TileLayerTile } from "@mp/tiled-loader";

export function graphFromTiled(tiled: TiledResource): VectorGraph<Tile> {
  const tilesByCoord = new Map<string, TileLayerTile[]>();
  for (const tile of tiled.layerTiles.values()) {
    upsertMap(tilesByCoord, vectorKey(tile), tile);
  }

  const graph = new VectorGraph<Tile>();
  const walkableCoords = new Map<string, Vector<Tile>>();
  for (const tilesAtCoord of tilesByCoord.values()) {
    const tile = tilesAtCoord[0];
    const tileRect = new Rect(Vector.from(tile), oneTile);
    const overlapSum = tiled
      .obscuringRects()
      .reduce((sum, obj) => sum + obj.overlap(tileRect), 0);
    if (overlapSum >= 0.2) {
      console.log("Discovered obscuring object", overlapSum);
    }
    if (
      TiledResource.isTileWalkable(
        ...tilesAtCoord.map((t) => t.tile.properties),
      ) &&
      overlapSum < 0.1
    ) {
      walkableCoords.set(
        vectorKey(tilesAtCoord[0]),
        Vector.from(tilesAtCoord[0]),
      );
      graph.addNode(Vector.from(tilesAtCoord[0]));
    }
  }

  for (const coord of walkableCoords.values()) {
    for (const [offsetX, offsetY] of neighborOffsets) {
      const neighborKey = vectorKey({
        x: coord.x + offsetX,
        y: coord.y + offsetY,
      });
      const from = walkableCoords.get(vectorKey(coord));
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

const oneTile = new Vector(1 as Tile, 1 as Tile);

type VectorKey = Branded<string, "VectorKey">;
const vectorKey = <T extends number>(v: VectorLike<T>): string =>
  `${v.x}|${v.y}` as VectorKey;
