import { Container, Graphics } from "@mp/pixi";
import { type TiledMap } from "@mp/tiled-loader";
import { LayerViewFactory } from "./layer";
import type { TextureByGID } from "./spritesheet";

export class TiledRenderer extends Container {
  constructor(tiledMap: TiledMap, textureByGID: TextureByGID) {
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

    const factory = new LayerViewFactory(tiledMap, textureByGID);
    for (const layerView of factory.createLayerViews()) {
      this.addChild(layerView);
    }
  }
}
