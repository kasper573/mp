import { Vector } from "@mp/math";
import type { Pixel, Tile } from "@mp/std";
import type {
  TiledMap,
  TileLayerTile,
  Layer,
  TiledObject,
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

  *objects(
    predicate: (obj: TiledObject) => boolean = all,
  ): Generator<TiledObject> {
    for (const layer of this.map.layers) {
      yield* objectsInLayer(layer, predicate);
    }
  }

  *tiles(
    predicate: (obj: TileLayerTile) => boolean = all,
  ): Generator<TileLayerTile> {
    for (const layer of this.map.layers) {
      yield* tilesInLayer(layer, predicate);
    }
  }
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
