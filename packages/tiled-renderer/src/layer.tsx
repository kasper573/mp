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

type LayerView = Container;

export class LayerViewFactory {
  constructor(private readonly textureLookup: TextureLookup) {}

  createLayerContainer(layers: Layer[]): LayerView {
    const container = new Container({
      isRenderGroup: true,
      sortableChildren: true,
    });

    // layers are already in the draw order in the tiled data
    layers.forEach((layer, index) => {
      const view = this.createLayerView(layer);
      memorizeLayerType(view, layer);
      view.label = layer.name;
      container.addChildAt(view, index);
    });

    return container;
  }

  private createGroupLayerView(layer: GroupLayer): LayerView {
    return this.createLayerContainer(layer.layers);
  }

  private createTileLayerView(layer: TileLayer): LayerView {
    const container = new Container({ isRenderGroup: true });
    for (const tile of layer.tiles) {
      container.addChild(createTileSprite(tile, this.textureLookup));
    }
    return container;
  }

  private createImageLayerView(layer: ImageLayer): LayerView {
    throw new Error("Not implemented");
  }

  private createObjectGroupLayerView(layer: ObjectGroupLayer): LayerView {
    const view = new Container({
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

type TiledObjectSorter = (arr: TiledObject[]) => TiledObject[];

// We store layer type on a symbol because pixi.js
// containers don't have a way to attach meta data

const layerTypeSymbol = Symbol("layerType");

function memorizeLayerType(view: Container, layer: Layer) {
  Reflect.set(view, layerTypeSymbol, layer.type);
}

export function getLayerType(view: Container): Layer["type"] {
  return Reflect.get(view, layerTypeSymbol) as Layer["type"];
}
