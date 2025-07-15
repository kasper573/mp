import { Vector } from "@mp/math";
import type { Pixel, Tile } from "@mp/std";
import {
  type TiledMap,
  type TileLayerTile,
  type Layer,
  type TiledObject,
  type TilesetTile,
  type GlobalTileId,
  localToGlobalId,
} from "@mp/tiled-loader";

export class TiledResource {
  constructor(public readonly map: TiledMap) {}

  get tileSize() {
    return new Vector(this.map.tilewidth, this.map.tileheight);
  }

  get mapSize(): Vector<Pixel> {
    return this.tileCount.scale(this.tileSize);
  }

  get tileCount(): Vector<Tile> {
    return new Vector(this.map.width, this.map.height);
  }

  worldCoordToTile = ({ x, y }: Vector<Pixel>): Vector<Tile> => {
    return new Vector(
      (x / this.map.tilewidth - 0.5) as Tile,
      (y / this.map.tileheight - 0.5) as Tile,
    );
  };

  tileCoordToWorld = ({ x, y }: Vector<Tile>): Vector<Pixel> => {
    return new Vector(
      ((x + 0.5) * this.map.tilewidth) as Pixel,
      ((y + 0.5) * this.map.tileheight) as Pixel,
    );
  };

  tileToWorldUnit = (n: Tile): Pixel => (n * this.map.tilewidth) as Pixel;

  *tilesetTiles(): Generator<TilesetTile & { gid: GlobalTileId }> {
    for (const tileset of this.map.tilesets) {
      for (const tile of tileset.tiles.values()) {
        const gid = localToGlobalId(tileset.firstgid, tile.id);
        yield { gid, ...tile };
      }
    }
  }

  *layerTiles(): Generator<TileLayerTile> {
    for (const layer of this.map.layers) {
      yield* tileLayerTiles(layer);
    }
  }

  *objects(): Generator<TiledObject> {
    for (const layer of this.map.layers) {
      yield* objectsInLayer(layer);
    }
  }
}

function* tileLayerTiles(layer: Layer): Generator<TileLayerTile> {
  switch (layer.type) {
    case "group":
      for (const subLayer of layer.layers) {
        yield* tileLayerTiles(subLayer);
      }
      break;
    case "tilelayer":
      for (const tile of layer.tiles) {
        yield tile;
      }
      break;
  }
}

function* objectsInLayer(layer: Layer): Generator<TiledObject> {
  switch (layer.type) {
    case "group":
      for (const subLayer of layer.layers) {
        yield* objectsInLayer(subLayer);
      }
      break;
    case "objectgroup":
      for (const obj of layer.objects) {
        yield obj;
      }
      break;
  }
}
