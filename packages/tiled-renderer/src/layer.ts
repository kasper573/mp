import { Container } from "@mp/pixi";
import type {
  GroupLayer,
  ImageLayer,
  Layer,
  ObjectGroupLayer,
  TileLayer,
} from "@mp/tiled-loader";
import { createObjectGraphics } from "./object";

export abstract class LayerContainer<L extends Layer> extends Container {
  constructor(protected readonly layer: L) {
    super();

    this.initialize();
  }

  protected abstract initialize(): void;
}

export class GroupLayerContainer extends LayerContainer<GroupLayer> {
  protected initialize(): void {
    this.layer.layers.forEach((layer) =>
      this.addChild(createLayerContainer(layer)),
    );
  }
}

export class TileLayerContainer extends LayerContainer<TileLayer> {
  protected initialize(): void {}
}

export class ImageLayerContainer extends LayerContainer<ImageLayer> {
  protected initialize(): void {}
}

export class ObjectGroupLayerContainer extends LayerContainer<ObjectGroupLayer> {
  protected initialize(): void {
    this.layer.objects.forEach((obj) =>
      this.addChild(createObjectGraphics(obj)),
    );
  }
}

export function createLayerContainer(layer: Layer): Container {
  switch (layer.type) {
    case "group":
      return new GroupLayerContainer(layer);
    case "tilelayer":
      return new TileLayerContainer(layer);
    case "imagelayer":
      return new ImageLayerContainer(layer);
    case "objectgroup":
      return new ObjectGroupLayerContainer(layer);
  }
}
