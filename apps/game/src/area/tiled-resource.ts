import { Vector } from "@mp/math";
import type { Pixel, Tile } from "@mp/std";
import type {
  TiledMap,
  TileLayerTile,
  Layer,
  TiledObject,
  GlobalTileId,
} from "@mp/tiled-loader";

export class TiledResource {
  #tiles = new Map<GlobalTileId, TileLayerTile>();
  #objects = new Map<TiledObject["id"], TiledObject>();

  get tiles(): ReadonlyMap<GlobalTileId, TileLayerTile> {
    return this.#tiles;
  }

  get objects(): ReadonlyMap<TiledObject["id"], TiledObject> {
    return this.#objects;
  }

  constructor(public readonly map: TiledMap) {
    for (const layer of this.map.layers) {
      for (const tile of tilesInLayer(layer, all)) {
        this.#tiles.set(tile.id, tile);
      }
      for (const object of objectsInLayer(layer, all)) {
        if (this.#objects.has(object.id)) {
          throw new Error(
            `Duplicate object id "${object.id}" found in layer "${layer.name}"`,
          );
        }
        this.#objects.set(object.id, object);
      }
    }
  }

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
}

function* tilesInLayer(
  layer: Layer,
  predicate: (tile: TileLayerTile) => boolean,
): Generator<TileLayerTile> {
  switch (layer.type) {
    case "group":
      for (const subLayer of layer.layers) {
        yield* tilesInLayer(subLayer, predicate);
      }
      break;
    case "tilelayer":
      for (const tile of layer.tiles) {
        if (predicate(tile)) {
          yield tile;
        }
      }
      break;
  }
}

function* objectsInLayer(
  layer: Layer,
  filter: (obj: TiledObject) => boolean,
): Generator<TiledObject> {
  switch (layer.type) {
    case "group":
      for (const subLayer of layer.layers) {
        yield* objectsInLayer(subLayer, filter);
      }
      break;
    case "objectgroup":
      yield* layer.objects.filter(filter);
      break;
  }
}

const all = () => true;
