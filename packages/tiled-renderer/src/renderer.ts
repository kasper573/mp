import { Graphics } from "@mp/pixi";
import { type TiledMap } from "@mp/tiled-loader";
import { LayerContainer, LayerViewFactory } from "./layer";
import type { TiledSpritesheetRecord } from "./spritesheet";
import { createTextureLookup, loadTiledMapSpritesheets } from "./spritesheet";

export class TiledRenderer extends LayerContainer {
  private layerViews: LayerContainer[] = [];
  private spritesheets?: TiledSpritesheetRecord;

  constructor(
    private options: {
      map: TiledMap;
      debug?: boolean;
    },
  ) {
    super();

    this.on("added", this.activate as () => void);
    this.on("removed", this.deactivate);
  }

  private activate = async () => {
    await this.load();
    this.upsertLayerViews();
  };

  private deactivate = () => {
    if (this.spritesheets) {
      for (const spritesheet of Object.values(this.spritesheets)) {
        spritesheet.destroy();
      }
    }
    delete this.spritesheets;
    this.removeLayerViews();
  };

  load = async () => {
    const loader = new Graphics();
    const { width, height, tilewidth, tileheight } = this.options.map;
    loader.rect(0, 0, width * tilewidth, height * tileheight);
    loader.fill(0x0000ff);
    this.addChild(loader);

    this.spritesheets = await loadTiledMapSpritesheets(this.options.map);
  };

  private upsertLayerViews() {
    if (!this.spritesheets) {
      return;
    }

    const factory = new LayerViewFactory(
      this.options.map,
      createTextureLookup(this.spritesheets),
    );

    this.removeLayerViews();

    const layers = this.options.debug
      ? this.options.map.layers
      : this.options.map.layers.filter((l) => l.type !== "objectgroup");

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
