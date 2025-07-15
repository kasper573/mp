import type {
  GroupLayer,
  ImageLayer,
  Layer,
  LayerDrawOrder,
  ObjectGroupLayer,
  TiledObject,
  TileLayer,
} from "@mp/tiled-loader";
import { Container } from "@mp/graphics";
import { createObjectView } from "./object";
import type { TiledTextureLookup } from "./spritesheet";
import { createTileLayerRenderer } from "./layer-renderer";

export class LayerViewFactory {
  constructor(private readonly textureLookup: TiledTextureLookup) {}

  createLayerContainer(layers: Layer[]): Container {
    const container = new Container({
      isRenderGroup: true,
      sortableChildren: true,
    });

    // layers are already in the draw order in the tiled data
    for (const [index, layer] of layers.entries()) {
      const view = this.createLayerView(layer);
      view.label = layer.name;
      container.addChildAt(view, index);
    }

    return container;
  }

  private createGroupLayerView(layer: GroupLayer): Container {
    return this.createLayerContainer(layer.layers);
  }

  private createTileLayerView(layer: TileLayer): Container {
    return createTileLayerRenderer(layer, this.textureLookup);
  }

  private createImageLayerView(_: ImageLayer): Container {
    throw new Error("Not implemented");
  }

  private createObjectGroupLayerView(layer: ObjectGroupLayer): Container {
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

  private createLayerView(layer: Layer): Container {
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
