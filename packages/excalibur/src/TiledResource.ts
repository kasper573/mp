import type { TiledResourceOptions } from "@excaliburjs/plugin-tiled";
import { TiledResource as TiledResourceImpl } from "@excaliburjs/plugin-tiled";
import { Vector } from "excalibur";

export class TiledResource extends TiledResourceImpl {
  constructor(path: string, options?: TiledResourceOptions) {
    super(path, {
      useTilemapCameraStrategy: true,
      ...options,
    });
  }

  worldCoordToTile({ x, y }: VectorLike): Vector | undefined {
    const [tile] = this.getTilesByPoint(new Vector(x, y));
    if (tile) {
      const { x, y } = tile.exTile;
      return new Vector(x, y);
    }
  }

  tileCoordToWorld({ x, y }: VectorLike): Vector | undefined {
    for (const layer of this.getTileLayers()) {
      const tile = layer.getTileByCoordinate(x, y);
      if (tile) {
        const x = tile.exTile.pos.x + tile.exTile.width / 2;
        const y = tile.exTile.pos.y + tile.exTile.height / 2;
        return new Vector(x, y);
      }
    }
  }

  getMatchingTileCoordinates<T>(
    propertyFilter: string,
    valueFilter: (valuesForOneCoordinate: T[]) => boolean,
  ): Vector[] {
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
  }
}

export interface VectorLike {
  x: number;
  y: number;
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
