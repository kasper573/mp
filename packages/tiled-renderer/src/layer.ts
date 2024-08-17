import { Container } from "@mp/pixi";
import type {
  GroupLayer,
  ImageLayer,
  Layer,
  LayerDrawOrder,
  ObjectGroupLayer,
  TiledObject,
  TileLayer,
} from "@mp/tiled-loader";
import { createObjectView } from "./object";

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
  const toSorted = createObjectSorter(layer.draworder);

  for (const obj of toSorted(layer.objects)) {
    view.addChild(createObjectView(obj));
  }

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

function createObjectSorter(order: LayerDrawOrder): TiledObjectSorter {
  switch (order) {
    case "topdown":
      return (objects) =>
        objects.toSorted((a, b) => getObjectY(a) - getObjectY(b));
    case "index":
      return (objects) => objects;
  }
}

function getObjectY(obj: TiledObject): number {
  if (obj.objectType === "objectTemplate") {
    return getObjectY(obj.object);
  } else {
    return obj.y;
  }
}

type TiledObjectSorter = (arr: TiledObject[]) => TiledObject[];
