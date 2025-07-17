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

  constructor(public readonly map: TiledMap) {
    this.tileSize = new Vector(this.map.tilewidth, this.map.tileheight);
    this.tileCount = new Vector(this.map.width, this.map.height);
    this.mapSize = this.tileCount.scale(this.tileSize);
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

  *objects(): Generator<TiledObject> {
    yield* objectsInLayers(this.map.layers);
  }
}
