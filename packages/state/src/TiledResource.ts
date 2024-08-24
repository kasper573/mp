import { Vector } from "@mp/math";
import type { TiledMap, TileLayerTile, Layer } from "@mp/tiled-loader";

export class TiledResource {
  constructor(private map: TiledMap) {}
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
    const predicate = propertyFilterPredicate(propertyFilter);
    return this.map.layers.flatMap((layer) =>
      filterTileLayerTiles(layer, predicate),
    );
  };
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

function propertyFilterPredicate(propertyFilter: string) {
  return (tile: TileLayerTile) => tile.tile.properties.has(propertyFilter);
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
