import { Container, Graphics } from "@mp/pixi";
import { type TiledMap } from "@mp/tiled-loader";
import { createLayerView } from "./layer";

export class TiledRenderer extends Container {
  constructor(private tiledMap: TiledMap) {
    super();

    const bg = new Graphics();
    bg.rect(
      0,
      0,
      tiledMap.width * tiledMap.tilewidth,
      tiledMap.height * tiledMap.tileheight,
    );
    bg.fill(0x0000ff);
    this.addChild(bg);

    // layers are already in the draw order in the tiled data
    for (const layer of this.tiledMap.layers) {
      this.addChild(createLayerView(layer));
    }
  }
}
