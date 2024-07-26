import { TiledResource as TiledResourceImpl } from "@excaliburjs/plugin-tiled";
import { Vector } from "excalibur";

export class TiledResource extends TiledResourceImpl {
  constructor(path: string) {
    super(path, {
      useTilemapCameraStrategy: true,
    });
  }

  worldCoordToTile(world: Vector): Vector | undefined {
    const [tile] = this.getTilesByPoint(world);
    if (tile) {
      return new Vector(tile.exTile.x, tile.exTile.y);
    }
  }

  tileCoordToWorld({ x, y }: Vector): Vector | undefined {
    for (const layer of this.getTileLayers()) {
      const tile = layer.getTileByCoordinate(x, y);
      if (tile) {
        return new Vector(
          tile.exTile.pos.x + tile.exTile.width / 2,
          tile.exTile.pos.y + tile.exTile.height / 2,
        );
      }
    }
  }
}
