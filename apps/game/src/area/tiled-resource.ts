import type { VectorLike } from "@mp/math";
import { Vector } from "@mp/math";
import type { Pixel, Tile } from "@mp/std";
import {
  type TiledMap,
  type TiledObject,
  objectsInLayers,
} from "@mp/tiled-loader";

export class TiledResource {
  readonly tileSize: Vector<Pixel>;
  readonly mapSize: Vector<Pixel>;
  readonly tileCount: Vector<Tile>;
  readonly objects: ReadonlyArray<TiledObject>;

  constructor(public readonly map: TiledMap) {
    this.tileSize = this.map.tileSize;
    this.tileCount = this.map.size;
    this.mapSize = this.tileCount.scale(this.tileSize);
    this.objects = objectsInLayers(this.map.layers);
  }

  worldCoordToTile = ({ x, y }: VectorLike<Pixel>): Vector<Tile> => {
    return new Vector(
      (x / this.map.tileSize.x - 0.5) as Tile,
      (y / this.map.tileSize.y - 0.5) as Tile,
    );
  };

  tileCoordToWorld = ({ x, y }: VectorLike<Tile>): Vector<Pixel> => {
    return new Vector(
      ((x + 0.5) * this.map.tileSize.x) as Pixel,
      ((y + 0.5) * this.map.tileSize.y) as Pixel,
    );
  };

  tileToWorldUnit = (n: Tile): Pixel => (n * this.map.tileSize.x) as Pixel;
}
