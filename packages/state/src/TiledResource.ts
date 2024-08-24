import { Vector } from "@mp/math";
import type {
  TiledMap,
  TileLayerTile,
  Layer,
  TileLayer,
  TiledObject,
  TiledClass,
} from "@mp/tiled-loader";

export class TiledResource {
  constructor(public readonly map: TiledMap) {}
  get tileSize() {
    return new Vector(this.map.tilewidth, this.map.tileheight);
  }

  worldCoordToTile = ({ x, y }: Vector): Vector => {
    return new Vector(
      x / this.map.tilewidth - 0.5,
      y / this.map.tileheight - 0.5,
    );
  };

  tileCoordToWorld = ({ x, y }: Vector): Vector => {
    return new Vector(
      (x + 0.5) * this.map.tilewidth,
      (y + 0.5) * this.map.tileheight,
    );
  };

  tileUnitToWorld = (n: number): number => n * this.map.tilewidth;

  getMatchingTileCoords = <T>(
    propertyFilter: string,
    valueFilter: (valuesForOneCoordinate: T[]) => boolean,
  ): Vector[] => {
    const tilesPerCoordinate = groupBy(
      this.getTilesByProperty(propertyFilter).map((layerTile) => ({
        pos: new Vector(
          layerTile.x * this.map.tilewidth,
          layerTile.y * this.map.tileheight,
        ),
        value: layerTile.tile.properties.get(propertyFilter) as T,
      })),
      ({ pos: { x, y } }) => `${x}|${y}`,
    );

    const coordinates: Vector[] = [];
    for (const tiles of tilesPerCoordinate.values()) {
      const values = tiles.map((t) => t.value);
      if (valueFilter(values)) {
        coordinates.push(tiles[0].pos);
      }
    }

    return coordinates;
  };

  getTilesByProperty = (propertyFilter: string): TileLayerTile[] => {
    const predicate = (lt: TileLayerTile) =>
      lt.tile.properties.has(propertyFilter);
    return this.map.layers.flatMap((layer) =>
      filterTileLayerTiles(layer, predicate),
    );
  };

  getObjectsByClassName = (className: TiledClass): TiledObject[] => {
    const predicate = (obj: TiledObject) =>
      obj.objectType !== "template" && obj.type === className;
    return this.map.layers.flatMap((layer) =>
      filterTiledObjects(layer, predicate),
    );
  };

  getTileLayers = (name: string): TileLayer[] => {
    const predicate = (layer: TileLayer) => layer.name === name;
    return this.map.layers.flatMap((layer) =>
      filterTileLayers(layer, predicate),
    );
  };

  getObjects = (): Iterable<TiledObject> =>
    this.map.layers.flatMap((layer) => filterTiledObjects(layer, yes));
}

export function snapTileVector({ x, y }: Vector): Vector {
  return new Vector(Math.floor(x + 0.5), Math.floor(y + 0.5));
}

function groupBy<T, K>(array: Iterable<T>, key: (item: T) => K): Map<K, T[]> {
  const map = new Map<K, T[]>();
  for (const item of array) {
    const k = key(item);
    let items = map.get(k);
    if (!items) {
      items = [];
      map.set(k, items);
    }
    items.push(item);
  }
  return map;
}

function filterTileLayers(
  layer: Layer,
  filter: (layer: TileLayer) => boolean,
): TileLayer[] {
  switch (layer.type) {
    case "group":
      return layer.layers.flatMap((child) => filterTileLayers(child, filter));
    case "tilelayer":
      return filter(layer) ? [layer] : [];
    case "imagelayer":
      return [];
    case "objectgroup":
      return [];
  }
}

function filterTileLayerTiles(
  layer: Layer,
  filter: (tile: TileLayerTile) => boolean,
): TileLayerTile[] {
  switch (layer.type) {
    case "group":
      return layer.layers.flatMap((child) =>
        filterTileLayerTiles(child, filter),
      );
    case "tilelayer":
      return layer.tiles.filter(filter);
    case "imagelayer":
      return [];
    case "objectgroup":
      return [];
  }
}

function filterTiledObjects(
  layer: Layer,
  filter: (obj: TiledObject) => boolean,
): TiledObject[] {
  switch (layer.type) {
    case "group":
      return layer.layers.flatMap((child) => filterTiledObjects(child, filter));
    case "tilelayer":
      return [];
    case "imagelayer":
      return [];
    case "objectgroup":
      return layer.objects.filter(filter);
  }
}

const yes = () => true;
