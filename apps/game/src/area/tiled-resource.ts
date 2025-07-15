import { Vector } from "@mp/math";
import type { Pixel, Tile } from "@mp/std";
import type { TiledMap, Layer, TiledObject } from "@mp/tiled-loader";

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

  *objects(): Generator<TiledObject> {
    for (const layer of this.map.layers) {
      yield* objectsInLayer(layer);
    }
  }
}

function* objectsInLayer(layer: Layer): Generator<TiledObject> {
  switch (layer.type) {
    case "group":
      for (const subLayer of layer.layers) {
        yield* objectsInLayer(subLayer);
      }
      break;
    case "objectgroup":
      for (const obj of layer.objects) {
        yield obj;
      }
      break;
  }
}
