import { Container } from "@mp/pixi";
import type {
  GroupLayer,
  ImageLayer,
  Layer,
  LayerDrawOrder,
  ObjectGroupLayer,
  TiledMap,
  TiledObject,
  TileLayer,
} from "@mp/tiled-loader";
import { createObjectView } from "./object";
import { createTileSprite } from "./tile";
import type { TextureByGID } from "./spritesheet";

export type LayerView = Container;

export class LayerViewFactory {
  constructor(
    private readonly tiledMap: TiledMap,
    private readonly textureByGID: TextureByGID,
  ) {}

  createLayerViews(layers = this.tiledMap.layers) {
    // layers are already in the draw order in the tiled data
    return layers.map((layer, index) => {
      const view = this.createLayerView(layer);
      view.zIndex = index;
      return view;
    });
  }

  private createGroupLayerView(layer: GroupLayer): LayerView {
    const container = new LayerContainer();
    for (const childLayerView of this.createLayerViews(layer.layers)) {
      container.addChild(childLayerView);
    }
    return container;
  }

  private createTileLayerView(layer: TileLayer): LayerView {
    const container = new Container({ isRenderGroup: true });
    for (const tile of layer.tiles) {
      container.addChild(createTileSprite(tile, this.textureByGID));
    }
    return container;
  }

  private createImageLayerView(layer: ImageLayer): LayerView {
    throw new Error("Not implemented");
  }

  private createObjectGroupLayerView(layer: ObjectGroupLayer): LayerView {
    const view = new LayerContainer();
    const toSorted = createObjectSorter(layer.draworder);

    for (const obj of toSorted(layer.objects)) {
      view.addChild(createObjectView(obj));
    }

    return view;
  }

  private createLayerView(layer: Layer): LayerView {
    switch (layer.type) {
      case "group":
        return this.createGroupLayerView(layer);
      case "tilelayer":
        return this.createTileLayerView(layer);
      case "imagelayer":
        return this.createImageLayerView(layer);
      case "objectgroup":
        return this.createObjectGroupLayerView(layer);
    }
  }
}

export class LayerContainer extends Container {
  constructor() {
    super({ isRenderGroup: true, sortableChildren: true });
  }
}

function createObjectSorter(order: LayerDrawOrder): TiledObjectSorter {
  switch (order) {
    case "topdown":
      return (objects) => objects.toSorted((a, b) => a.y - b.y);
    case "index":
      return (objects) => objects;
  }
}

type TiledObjectSorter = (arr: TiledObject[]) => TiledObject[];
