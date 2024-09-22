import { type TiledMap } from "@mp/tiled-loader";
import { LayerContainer, LayerViewFactory } from "./layer";
import type { TiledSpritesheetRecord } from "./spritesheet";
import { createTextureLookup, loadTiledMapSpritesheets } from "./spritesheet";

export class TiledRenderer extends LayerContainer {
  private layerViews: LayerContainer[] = [];
  private spritesheets?: TiledSpritesheetRecord;
  private debugUIEnabled = false;

  constructor(private map: () => TiledMap) {
    super();

    this.on("added", this.activate as () => void);
    this.on("removed", this.deactivate);
  }

  private activate = async () => {
    this.spritesheets = await loadTiledMapSpritesheets(this.map());
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

  toggleDebugUI = (enabled: boolean) => {
    this.debugUIEnabled = enabled;
    this.upsertLayerViews();
  };

  private upsertLayerViews() {
    if (!this.spritesheets) {
      return;
    }

    const factory = new LayerViewFactory(
      this.map(),
      createTextureLookup(this.spritesheets),
    );

    this.removeLayerViews();

    const layers = this.debugUIEnabled
      ? this.map().layers
      : this.map().layers.filter((l) => l.type !== "objectgroup");

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
