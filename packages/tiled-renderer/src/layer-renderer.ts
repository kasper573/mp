import type {
  GroupLayer,
  Layer,
  LayerDrawOrder,
  ObjectGroupLayer,
  TiledObject,
} from "@mp/tiled-loader";
import { Container } from "@mp/graphics";
import { createObjectRenderer } from "./tile-object-renderer";
import type { TiledTextureLookup } from "./spritesheet";
import { createTileLayerRenderer } from "./tile-layer-renderer";

export function createNestedLayerRenderer(
  layers: Layer[],
  textureLookup: TiledTextureLookup,
): Container {
  const container = new Container({
    isRenderGroup: true,
    sortableChildren: true,
  });

  // layers are already in the draw order in the tiled data
  for (const [index, layer] of layers.entries()) {
    const layerRenderer = createLayerRenderer(layer, textureLookup);
    layerRenderer.label = layer.name;
    container.addChildAt(layerRenderer, index);
  }

  return container;
}

function createGroupLayerRenderer(
  layer: GroupLayer,
  textureLookup: TiledTextureLookup,
): Container {
  return createNestedLayerRenderer(layer.layers, textureLookup);
}

function createObjectGroupLayerRenderer(layer: ObjectGroupLayer): Container {
  const view = new Container({
    isRenderGroup: true,
    sortableChildren: true,
  });

  const toSorted = createObjectSorter(layer.draworder);

  for (const obj of toSorted(layer.objects)) {
    view.addChild(createObjectRenderer(obj));
  }

  return view;
}

function createLayerRenderer(
  layer: Layer,
  textureLookup: TiledTextureLookup,
): Container {
  switch (layer.type) {
    case "group":
      return createGroupLayerRenderer(layer, textureLookup);
    case "tilelayer":
      return createTileLayerRenderer(layer, textureLookup);
    case "imagelayer":
      throw new Error("Not implemented");
    case "objectgroup":
      return createObjectGroupLayerRenderer(layer);
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
