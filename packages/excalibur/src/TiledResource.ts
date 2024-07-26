import type { TiledResourceOptions } from "@excaliburjs/plugin-tiled";
import { TiledResource as TiledResourceImpl } from "@excaliburjs/plugin-tiled";
import type { IsometricTileInfo } from "@excaliburjs/plugin-tiled/dist/src/resource/iso-tile-layer";
import type { TileInfo } from "@excaliburjs/plugin-tiled/dist/src/resource/tile-layer";
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
  ) {
    type Tile = TileInfo | IsometricTileInfo;

    const tilesPerCoordinate = new Map<string, Tile[]>();
    for (const tile of this.getTilesByProperty(propertyFilter)) {
      const id = `${tile.exTile.x}|${tile.exTile.y}`;
      let tiles = tilesPerCoordinate.get(id);
      if (!tiles) {
        tiles = [];
        tilesPerCoordinate.set(id, tiles);
      }
      tiles.push(tile);
    }

    const coordinates: VectorLike[] = [];
    for (const tiles of tilesPerCoordinate.values()) {
      const values = tiles.map(
        (t) => t.tiledTile?.properties?.get(propertyFilter) as T,
      );
      if (valueFilter(values)) {
        const { x, y } = tiles[0].exTile;
        coordinates.push({ x, y });
      }
    }

    return coordinates;
  }
}

export interface VectorLike {
  x: number;
  y: number;
}
