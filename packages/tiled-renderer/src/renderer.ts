import { Container, Graphics } from "@mp/pixi";
import { type TiledMap } from "@mp/tiled-loader";
import { LayerViewFactory } from "./layer";
import {
  createTextureByGIDQuery,
  loadTiledMapSpritesheets,
} from "./spritesheet";

export class TiledRenderer extends Container {
  private loader: Graphics;
  constructor(private map: TiledMap) {
    super();

    this.loader = new Graphics();
    this.loader.rect(
      0,
      0,
      map.width * map.tilewidth,
      map.height * map.tileheight,
    );
    this.loader.fill(0x0000ff);
    this.addChild(this.loader);

    this.load();
  }

  async load() {
    // TODO container lifecyle
    const spritesheets = await loadTiledMapSpritesheets(this.map);

    const factory = new LayerViewFactory(
      this.map,
      createTextureByGIDQuery(spritesheets),
    );

    for (const layerView of factory.createLayerViews()) {
      this.addChild(layerView);
    }

    this.removeChild(this.loader);
  }
}
