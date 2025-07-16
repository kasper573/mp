import type { Layer } from "@mp/tiled-loader";
import type { IRenderLayer } from "@mp/graphics";
import { Container } from "@mp/graphics";
import type { TiledTextureLookup } from "./spritesheet";
import { renderLayerTilesSorted } from "./tile-renderer-sorted";
import { renderTileObject } from "./tile-object-renderer";

export class TiledRenderer extends Container {
  constructor(
    layers: Layer[],
    sortingLayer: IRenderLayer,
    textureLookup: TiledTextureLookup,
  ) {
    super({ isRenderGroup: true });

    renderTiledLayersInto(this, sortingLayer, layers, textureLookup);
  }
}

function renderTiledLayers(
  layers: Layer[],
  sortingLayer: IRenderLayer,
  textureLookup: TiledTextureLookup,
): Container {
  const container = new Container({ isRenderGroup: true });
  renderTiledLayersInto(container, sortingLayer, layers, textureLookup);
  return container;
}

function renderTiledLayersInto(
  container: Container,
  sortingLayer: IRenderLayer,
  layers: Layer[],
  textureLookup: TiledTextureLookup,
): void {
  // layers are already in the draw order in the tiled data
  for (const [index, layer] of layers.entries()) {
    const layerRenderer = renderTiledLayer(layer, sortingLayer, textureLookup);
    if (layerRenderer) {
      layerRenderer.position.set(layer.offsetx, layer.offsety);
      layerRenderer.label = layer.name;
      container.addChildAt(layerRenderer, index);
    }
  }
}
function renderTiledLayer(
  layer: Layer,
  sortingLayer: IRenderLayer,
  textureLookup: TiledTextureLookup,
): Container | undefined {
  switch (layer.type) {
    case "group":
      return renderTiledLayers(layer.layers, sortingLayer, textureLookup);
    case "tilelayer":
      return renderLayerTilesSorted(layer.tiles, sortingLayer, textureLookup);
    case "imagelayer":
      throw new Error("Not implemented");
    case "objectgroup": {
      if (!layer.objects.length) {
        return;
      }
      const container = new Container({ isRenderGroup: true });
      for (const obj of layer.objects) {
        const mesh = renderTileObject(obj, textureLookup);
        if (mesh) {
          container.addChild(mesh);
          mesh.zIndex = mesh.y;
        }
      }
      return container;
    }
  }
}
