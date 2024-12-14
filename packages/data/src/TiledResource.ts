import type { Size, Vector } from "@mp/math";
import { vec } from "@mp/math";
import type {
  Layer,
  TiledClass,
  TiledMap,
  TiledObject,
  TileLayer,
  TileLayerTile,
} from "@mp/tiled-loader";

export class TiledResource {
  constructor(public readonly map: TiledMap) {}

  get tileSize() {
    return vec(this.map.tilewidth, this.map.tileheight);
  }

  get mapSize(): Size {
    return {
      width: this.map.width * this.map.tilewidth,
      height: this.map.height * this.map.tileheight,
    };
  }

  worldCoordToTile = ({ x, y }: Vector): Vector => {
    return vec(x / this.map.tilewidth - 0.5, y / this.map.tileheight - 0.5);
  };

  tileCoordToWorld = ({ x, y }: Vector): Vector => {
    return vec((x + 0.5) * this.map.tilewidth, (y + 0.5) * this.map.tileheight);
  };

  tileUnitToWorld = (n: number): number => n * this.map.tilewidth;

  getMatchingTileCoords = <T>(
    getValue: (tile: TileLayerTile) => T,
    coordinateTest: (values: NoInfer<T>[]) => boolean,
  ): Vector[] => {
    const tilesPerCoordinate = groupBy(
      this.map.layers
        .flatMap((layer) => filterTileLayerTiles(layer, all))
        .map((layerTile) => ({
          pos: vec(layerTile.x, layerTile.y),
          propertyValue: getValue(layerTile),
        })),
      ({ pos: { x, y } }) => `${x}|${y}`,
    );

    const coordinates: Vector[] = [];
    for (const tiles of tilesPerCoordinate.values()) {
      const values = tiles.map((t) => t.propertyValue);
      if (coordinateTest(values)) {
        coordinates.push(tiles[0].pos);
      }
    }

    return coordinates;
  };

  getTilesByProperty = (propertyFilter: string): TileLayerTile[] => {
    const predicate = (lt: TileLayerTile) =>
      lt.tile.properties.has(propertyFilter);
    return this.map.layers.flatMap((layer) =>
      filterTileLayerTiles(layer, predicate)
    );
  };

  getObjectsByClassName = (className: TiledClass): TiledObject[] => {
    const predicate = (obj: TiledObject) => obj.type === className;
    return this.map.layers.flatMap((layer) =>
      filterTiledObjects(layer, predicate)
    );
  };

  getTileLayers = (name: string): TileLayer[] => {
    const predicate = (layer: TileLayer) => layer.name === name;
    return this.map.layers.flatMap((layer) =>
      filterTileLayers(layer, predicate)
    );
  };

  getObjects = (): Iterable<TiledObject> =>
    this.map.layers.flatMap((layer) => filterTiledObjects(layer, all));
}

export function snapTileVector({ x, y }: Vector): Vector {
  return vec(Math.floor(x + 0.5), Math.floor(y + 0.5));
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
        filterTileLayerTiles(child, filter)
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

const all = () => true;
