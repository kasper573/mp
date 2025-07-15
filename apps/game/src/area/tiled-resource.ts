import { Vector } from "@mp/math";
import type { Pixel, Tile } from "@mp/std";
import type {
  TiledMap,
  TileLayerTile,
  Layer,
  TiledObject,
} from "@mp/tiled-loader";

export class TiledResource {
  #objects = new Map<TiledObject["id"], TiledObject>();
  #tileList: TileLayerTile[];

  get objects(): ReadonlyMap<TiledObject["id"], TiledObject> {
    return this.#objects;
  }

  get tiles(): ReadonlyArray<TileLayerTile> {
    return this.#tileList;
  }

  constructor(public readonly map: TiledMap) {
    this.#objects = createObjectMap(map);
    this.#tileList = map.layers.flatMap(tilesInLayer);
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

function tilesInLayer(layer: Layer): TileLayerTile[] {
  switch (layer.type) {
    case "group":
      return layer.layers.flatMap(tilesInLayer);
    case "tilelayer":
      return layer.tiles;
    case "objectgroup":
    case "imagelayer":
      return [];
  }
}

function createObjectMap(map: TiledMap) {
  const objectMap = new Map<TiledObject["id"], TiledObject>();
  for (const layer of map.layers) {
    for (const object of objectsInLayer(layer)) {
      if (objectMap.has(object.id)) {
        throw new Error(
          `Duplicate object id "${object.id}" found in layer "${layer.name}"`,
        );
      }
      objectMap.set(object.id, object);
    }
  }
  return objectMap;
}

function objectsInLayer(layer: Layer): TiledObject[] {
  switch (layer.type) {
    case "group":
      return layer.layers.flatMap(objectsInLayer);
    case "objectgroup":
      return layer.objects;
    case "tilelayer":
    case "imagelayer":
      return [];
  }
}
