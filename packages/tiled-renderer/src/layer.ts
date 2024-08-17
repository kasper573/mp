import { Container } from "@mp/pixi";
import type {
  GroupLayer,
  ImageLayer,
  Layer,
  ObjectGroupLayer,
  TileLayer,
} from "@mp/tiled-loader";
import { createObjectGraphics } from "./object";

export abstract class LayerView<L extends Layer> extends Container {
  constructor(protected readonly layer: L) {
    super();

    this.initialize();
  }

  protected abstract initialize(): void;
}

export class GroupLayerView extends LayerView<GroupLayer> {
  protected initialize(): void {
    this.layer.layers.forEach((layer) => this.addChild(createLayerView(layer)));
  }
}

export class TileLayerView extends LayerView<TileLayer> {
  protected initialize(): void {}
}

export class ImageLayerView extends LayerView<ImageLayer> {
  protected initialize(): void {
    throw new Error("Not implemented");
  }
}

export class ObjectGroupLayerView extends LayerView<ObjectGroupLayer> {
  protected initialize(): void {
    this.layer.objects.forEach((obj) =>
      this.addChild(createObjectGraphics(obj)),
    );
  }
}

export function createLayerView(layer: Layer): Container {
  switch (layer.type) {
    case "group":
      return new GroupLayerView(layer);
    case "tilelayer":
      return new TileLayerView(layer);
    case "imagelayer":
      return new ImageLayerView(layer);
    case "objectgroup":
      return new ObjectGroupLayerView(layer);
  }
}
