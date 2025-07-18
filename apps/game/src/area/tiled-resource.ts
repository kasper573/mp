import { Vector } from "@mp/math";
import type { Pixel, Tile } from "@mp/std";
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

  getMatchingTileCoords = <T>(
    getValue: (tile: TileLayerTile) => T,
    coordinateTest: (values: NoInfer<T>[]) => boolean,
  ): Vector<Tile>[] => {
    const tilesPerCoordinate = groupBy(
      this.map.layers
        .flatMap((layer) => filterTileLayerTiles(layer, all))
        .map((layerTile) => ({
          pos: new Vector(layerTile.x, layerTile.y),
          propertyValue: getValue(layerTile),
        })),
      ({ pos: { x, y } }) => `${String(x)}|${String(y)}`,
    );

    const coordinates: Vector<Tile>[] = [];
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
      filterTileLayerTiles(layer, predicate),
    );
  };

  getObjectsByClassName = (className: TiledClass): TiledObject[] => {
    const predicate = (obj: TiledObject) => obj.type === className;
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
    this.map.layers.flatMap((layer) => filterTiledObjects(layer, all));
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
      // Transform old objects to new Vector-based objects
      return layer.objects
        .map((obj: unknown) => {
          // If it's already a Vector object, return as-is
          const objectCandidate = obj as Record<string, unknown>;
          if (objectCandidate.position && objectCandidate.size) {
            return obj as VectorTiledObjectUnion;
          }
          // Otherwise, transform it
          return transformToVectorObject(obj as TiledObject);
        })
        .filter(filter);
  }
}

const all = () => true;
