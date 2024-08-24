import { Container, Graphics } from "@mp/pixi";
import { type TiledMap } from "@mp/tiled-loader";
import { LayerViewFactory } from "./layer";
import type { TiledSpritesheetRecord } from "./spritesheet";
import {
  createTextureByGIDQuery,
  loadTiledMapSpritesheets,
} from "./spritesheet";

export class TiledRenderer extends Container {
  private spritesheets: TiledSpritesheetRecord = {};

  constructor(private map: TiledMap) {
    super();

    this.on("added", this.activate);
    this.on("removed", this.deactivate);
  }

  private activate = async () => {
    await this.load();
    this.updateLayers();
  };

  private deactivate = () => {
    for (const spritesheet of Object.values(this.spritesheets)) {
      spritesheet.destroy();
    }
    this.spritesheets = {};
  };

  async load() {
    const loader = new Graphics();
    loader.rect(
      0,
      0,
      this.map.width * this.map.tilewidth,
      this.map.height * this.map.tileheight,
    );
    loader.fill(0x0000ff);
    this.addChild(loader);

    this.spritesheets = await loadTiledMapSpritesheets(this.map);
  }

  private updateLayers() {
    const factory = new LayerViewFactory(
      this.map,
      createTextureByGIDQuery(this.spritesheets),
    );

    this.removeChildren();

    for (const layerView of factory.createLayerViews()) {
      this.addChild(layerView);
    }
  }
}
