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
import { decodeTileLayerData } from "@mp/tiled-decoder";
import { createObjectView } from "./object";
import { createTileSprite } from "./tile";

export type LayerView = Container;

export class LayerViewFactory {
  constructor(private readonly tiledMap: TiledMap) {}

  createLayerViews(layers = this.tiledMap.layers) {
    // layers are already in the draw order in the tiled data
    return layers.map((layer) => this.createLayerView(layer));
  }

  private createGroupLayerView(layer: GroupLayer): LayerView {
    const container = new Container();
    for (const childLayerView of this.createLayerViews(layer.layers)) {
      container.addChild(childLayerView);
    }
    return container;
  }

  private createTileLayerView(layer: TileLayer): LayerView {
    const tiles = decodeTileLayerData(layer, this.tiledMap);
    const container = new Container();
    for (const tile of tiles) {
      container.addChild(createTileSprite(tile));
    }
    return container;
  }

  private createImageLayerView(layer: ImageLayer): LayerView {
    throw new Error("Not implemented");
  }

  private createObjectGroupLayerView(layer: ObjectGroupLayer): LayerView {
    const view = new Container();
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
