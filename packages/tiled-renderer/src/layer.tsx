import type {
  GroupLayer,
  ImageLayer,
  Layer,
  LayerDrawOrder,
  ObjectGroupLayer,
  TiledObject,
  TileLayer,
} from "@mp/tiled-loader";
import { Container } from "@mp/pixi";
import { createObjectView } from "./object";
import { createTileSprite } from "./tile";
import type { TextureLookup } from "./spritesheet";

export type LayerView = Container;

export class LayerViewFactory {
  constructor(private readonly textureLookup: TextureLookup) {}

  createLayerContainer(layers: Layer[]): LayerView {
    const container = new TileRendererContainer({
      isRenderGroup: true,
      sortableChildren: true,
    });

    // layers are already in the draw order in the tiled data
    layers.forEach((layer, index) => {
      const view = this.createLayerView(layer);
      memorizeLayer(view, layer);
      view.label = `${layer.type}: "${layer.name}"`;
      container.addChildAt(view, index);
    });

    return container;
  }

  private createGroupLayerView(layer: GroupLayer): LayerView {
    return this.createLayerContainer(layer.layers);
  }

  private createTileLayerView(layer: TileLayer): LayerView {
    const container = new TileRendererContainer({ isRenderGroup: true });
    for (const tile of layer.tiles) {
      container.addChild(createTileSprite(tile, this.textureLookup));
    }
    return container;
  }

  private createImageLayerView(layer: ImageLayer): LayerView {
    throw new Error("Not implemented");
  }

  private createObjectGroupLayerView(layer: ObjectGroupLayer): LayerView {
    const view = new TileRendererContainer({
      isRenderGroup: true,
      sortableChildren: true,
    });

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

function createObjectSorter(order: LayerDrawOrder): TiledObjectSorter {
  switch (order) {
    case "topdown":
      return (objects) => objects.toSorted((a, b) => a.y - b.y);
    case "index":
      return (objects) => objects;
  }
}

// We use a separate class purely for debug purposes as it provides a name for pixijs devtools
class TileRendererContainer extends Container {}

type TiledObjectSorter = (arr: TiledObject[]) => TiledObject[];

// We store layer instance on a symbol because pixi.js
// containers don't have a way to attach meta data

const layerSymbol = Symbol("layer");

function memorizeLayer(view: Container, layer: Layer) {
  Reflect.set(view, layerSymbol, layer);
}

export function recallLayer(view: Container): Layer {
  return Reflect.get(view, layerSymbol) as Layer;
}
