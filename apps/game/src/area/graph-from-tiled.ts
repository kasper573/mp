import { VectorGraph } from "@mp/path-finding";
import type { Branded } from "@mp/std";
import { upsertMap, type Tile } from "@mp/std";
import type { TiledResource } from "./tiled-resource";
import type { VectorLike } from "@mp/math";
import { Rect } from "@mp/math";
import { Vector } from "@mp/math";
import type { GlobalTileId, TiledObject } from "@mp/tiled-loader";
import type { TileLayerTile } from "@mp/tiled-loader";

export function graphFromTiled(tiled: TiledResource): VectorGraph<Tile> {
  const tilesByGid = new Map<GlobalTileId, TileLayerTile[]>();
  const tilesByCoord = new Map<string, TileLayerTile[]>();
  for (const tile of tiled.tiles) {
    upsertMap(tilesByGid, tile.id, tile);
    upsertMap(tilesByCoord, vectorKey(tile), tile);
  }

  console.log("tilesByGid", tilesByGid.size);
  console.log(tilesByGid.keys().toArray());
  // The gid in objects refer to tiles that are actually rendered,
  // so we need to consider them for collission as well (if the tile they reference is not walkable)
  const obscuringRects: Rect<Tile>[] = [];
  for (const obj of tiled.objects.values()) {
    if (obj.gid !== undefined) {
      const referencedTiles = tilesByGid.get(obj.gid);
      console.log(
        "Discovered referencing object",
        obj.id,
        "->",
        obj.gid,
        referencedTiles?.length,
      );
      if (referencedTiles?.length && !isTileWalkable(...referencedTiles)) {
        console.log("Discovered obscuring object", obj.id);
        const { x, y, width, height } = referencedTiles[0];
        obscuringRects.push(
          Rect.fromComponents(
            x,
            y,
            (width / tiled.tileSize.x) as Tile,
            (height / tiled.tileSize.y) as Tile,
          ),
        );
      }
    }
  }

  const graph = new VectorGraph<Tile>();
  const walkableCoords = new Map<string, Vector<Tile>>();
  for (const tilesAtCoord of tilesByCoord.values()) {
    const tile = tilesAtCoord[0];
    const tileRect = new Rect(Vector.from(tile), oneTile);
    const overlapSum = obscuringRects.reduce(
      (sum, obj) => sum + obj.overlap(tileRect),
      0,
    );
    if (isTileWalkable(...tilesAtCoord) && overlapSum < 0.3) {
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

function isTileWalkable(...tiles: TileLayerTile[]): boolean {
  let walkable = false;
  for (const tile of tiles) {
    const val = tile.tile.properties.get("Walkable")?.value as
      | boolean
      | undefined;
    if (val === false) {
      return false;
    }
    if (val === true) {
      walkable = true;
    }
  }
  return walkable;
}
