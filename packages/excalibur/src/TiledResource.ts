import type { TiledResourceOptions } from "@excaliburjs/plugin-tiled";
import { TiledResource as TiledResourceImpl } from "@excaliburjs/plugin-tiled";
import { Vector } from "excalibur";
import type { VectorLike } from "./vector";

export class TiledResource extends TiledResourceImpl {
  constructor(path: string, options?: TiledResourceOptions) {
    super(path, {
      useTilemapCameraStrategy: true,
      ...options,
    });
  }

  worldCoordToTile = ({ x, y }: VectorLike): Vector => {
    return new Vector(x / this.map.tilewidth, y / this.map.tileheight);
  };

  tileCoordToWorld = ({ x, y }: VectorLike): Vector => {
    return new Vector(
      x * this.map.tilewidth + this.map.tilewidth / 2,
      y * this.map.tileheight + this.map.tileheight / 2,
    );
  };

  tileUnitToWorld = (n: number): number => n * this.map.tilewidth;

  getMatchingTileCoords = <T>(
    propertyFilter: string,
    valueFilter: (valuesForOneCoordinate: T[]) => boolean,
  ): Vector[] => {
    const tilesPerCoordinate = groupBy(
      this.getTilesByProperty(propertyFilter).map(({ exTile, tiledTile }) => ({
        pos: new Vector(exTile.x, exTile.y),
        value: tiledTile?.properties?.get(propertyFilter) as T,
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
