import { Container } from "@mp/pixi";
import type {
  GroupLayer,
  ImageLayer,
  Layer,
  ObjectGroupLayer,
  TileLayer,
} from "@mp/tiled-loader";
import { createObjectGraphics } from "./object";

export type LayerView = Container;

export function createGroupLayerView(layer: GroupLayer): LayerView {
  const container = new Container();
  for (const childLayer of layer.layers) {
    container.addChild(createLayerView(childLayer));
  }
  return container;
}

export function createTileLayerView(layer: TileLayer): LayerView {
  console.log(layer.name, layer);
  return new Container();
}

export function createImageLayerView(layer: ImageLayer): LayerView {
  throw new Error("Not implemented");
}

export function createObjectGroupLayerView(layer: ObjectGroupLayer): LayerView {
  const view = new Container();
  layer.objects.forEach((obj) => view.addChild(createObjectGraphics(obj)));
  return view;
}

export function createLayerView(layer: Layer): LayerView {
  switch (layer.type) {
    case "group":
      return createGroupLayerView(layer);
    case "tilelayer":
      return createTileLayerView(layer);
    case "imagelayer":
      return createImageLayerView(layer);
    case "objectgroup":
      return createObjectGroupLayerView(layer);
  }
}

export function createOrderedLayerViews(layers: Layer[]) {
  // layers are already in the draw order in the tiled data
  return layers.map(createLayerView);
}
