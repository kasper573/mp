import type { TiledResourceOptions } from "@excaliburjs/plugin-tiled";
import { TiledResource as TiledResourceImpl } from "@excaliburjs/plugin-tiled";
import { Vector } from "excalibur";
import type { VectorLike } from "./vector";
import { groupBy } from "./groupBy";

export class TiledResource extends TiledResourceImpl {
  constructor(tmxFile: string, options?: TiledResourceOptions) {
    super(tmxFile, {
      useTilemapCameraStrategy: true,
      fileLoader: (path) => fetch(path).then((r) => r.text()),
      ...options,
    });
  }

  get tileSize() {
    return new Vector(this.map.tilewidth, this.map.tileheight);
  }

  worldCoordToTile = ({ x, y }: VectorLike): Vector => {
    return new Vector(
      x / this.map.tilewidth - 0.5,
      y / this.map.tileheight - 0.5,
    );
  };

  tileCoordToWorld = ({ x, y }: VectorLike): Vector => {
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

export function snapTileVector({ x, y }: VectorLike): Vector {
  return new Vector(Math.floor(x + 0.5), Math.floor(y + 0.5));
}
