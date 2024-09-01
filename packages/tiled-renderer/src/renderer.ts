import { Graphics } from "@mp/pixi";
import { type TiledMap } from "@mp/tiled-loader";
import { LayerContainer, LayerViewFactory } from "./layer";
import type { TiledSpritesheetRecord } from "./spritesheet";
import { createTextureLookup, loadTiledMapSpritesheets } from "./spritesheet";

export class TiledRenderer extends LayerContainer {
  private layerViews: LayerContainer[] = [];
  private spritesheets: TiledSpritesheetRecord = {};
  private debugUIEnabled = false;

  constructor(private map: TiledMap) {
    super();

    this.on("added", this.activate);
    this.on("removed", this.deactivate);
  }

  private activate = async () => {
    await this.load();
    this.upsertLayerViews();
  };

  private deactivate = () => {
    for (const spritesheet of Object.values(this.spritesheets)) {
      spritesheet.destroy();
    }
    this.spritesheets = {};
    this.removeLayerViews();
  };

  load = async () => {
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
  };

  toggleDebugUI = (enabled: boolean) => {
    this.debugUIEnabled = enabled;
    this.upsertLayerViews();
  };

  private upsertLayerViews() {
    const factory = new LayerViewFactory(
      this.map,
      createTextureLookup(this.spritesheets),
    );

    this.removeLayerViews();

    const layers = this.debugUIEnabled
      ? this.map.layers
      : this.map.layers.filter((l) => l.type !== "objectgroup");

    this.layerViews = factory.createLayerViews(layers);
    for (const layerView of this.layerViews) {
      this.addChild(layerView);
    }
  }

  private removeLayerViews() {
    for (const child of this.layerViews) {
      this.removeChild(child);
      child.destroy();
    }
  }
}
