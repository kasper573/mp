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
}

export interface VectorLike {
  x: number;
  y: number;
}
