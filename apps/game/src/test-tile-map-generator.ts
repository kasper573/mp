import type { Vector } from "@mp/math";
import type { Tile, Pixel } from "@mp/std";
import type {
  TileLayerTile,
  GlobalTileId,
  LayerId,
  LocalTileId,
  TilesetTile,
  Tileset,
  FilePath,
  TileLayer,
  Ratio,
  Layer,
} from "@mp/tiled-loader";

export function generateRepeatedTileLayer(
  mapSize: Vector<Tile>,
  tileSize: Vector<Pixel>,
  tile: TilesetTile,
  tileset: Tileset,
): Layer {
  const tileToRepeat: TileLayerTile = {
    id: 0 as GlobalTileId,
    flags: {
      flippedDiagonally: false,
      flippedHorizontally: false,
      flippedVertically: false,
      rotatedHexagonal120: false,
    },
    width: tileSize.x,
    height: tileSize.y,
    tile,
    tileset,
    x: 0 as Tile,
    y: 0 as Tile,
  };
  return createTileLayer(mapSize, tileToRepeat);
}

export function generateTilesetTile(id: LocalTileId): TilesetTile {
  return {
    id,
    properties: new Map(),
  };
}

export function generateTileset(
  firstGid: GlobalTileId,
  tiles: TilesetTile[],
  tileSize: Vector<Pixel>,
): Tileset {
  return {
    columns: 1 as Tile,
    firstgid: firstGid,
    imagewidth: tileSize.x,
    imageheight: (tileSize.y * tiles.length) as Pixel,
    tilecount: tiles.length as Tile,
    tiles: new Map(tiles.map((tile) => [tile.id, tile])),

    // Bogus unused values to satisfy types
    margin: 0 as Pixel,
    spacing: 0 as Pixel,
    image: "test-tileset.png" as FilePath,
    name: "Test Tileset",
    fillmode: "",
    objectalignment: "unspecified",
    properties: new Map(),
    tiledversion: "1.0",
    tilerendersize: "tile",
  };
}

function createTileLayer(
  mapSize: Vector<Tile>,
  tileToRepeat: TileLayerTile,
): TileLayer {
  const newTileLayer: TileLayer = {
    x: 0 as Tile,
    y: 0 as Tile,
    offsetx: 0 as Pixel,
    offsety: 0 as Pixel,
    parallaxx: 0 as Ratio,
    parallaxy: 0 as Ratio,
    width: mapSize.x,
    height: mapSize.y,
    id: 1 as LayerId,
    locked: false,
    name: "Autoscaled layer",
    opacity: 1 as Ratio,
    properties: new Map(),
    tiles: [],
    type: "tilelayer",
    visible: true,
  };
  for (let x = 0; x < mapSize.x; x++) {
    for (let y = 0; y < mapSize.y; y++) {
      newTileLayer.tiles.push({
        ...tileToRepeat,
        x: x as Tile,
        y: y as Tile,
      });
    }
  }
  return newTileLayer;
}
