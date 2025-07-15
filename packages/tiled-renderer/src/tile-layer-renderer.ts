import type { Layer } from "@mp/tiled-loader";
import { Container } from "@mp/graphics";
import type { TiledTextureLookup } from "./spritesheet";
import { renderLayerTilesSorted } from "./tile-renderer-sorted";
import { renderTileObjects } from "./tile-object-renderer";

export function renderTiledLayers(
  layers: Layer[],
  textureLookup: TiledTextureLookup,
): Container {
  const container = new Container({
    isRenderGroup: true,
    sortableChildren: true,
  });

  // layers are already in the draw order in the tiled data
  for (const [index, layer] of layers.entries()) {
    const layerRenderer = renderTiledLayer(layer, textureLookup);
    layerRenderer.position.set(layer.offsetx, layer.offsety);
    layerRenderer.label = layer.name;
    container.addChildAt(layerRenderer, index);
  }

  return container;
}

export function renderTiledLayer(
  layer: Layer,
  textureLookup: TiledTextureLookup,
): Container {
  switch (layer.type) {
    case "group":
      return renderTiledLayers(layer.layers, textureLookup);
    case "tilelayer":
      return renderLayerTilesSorted(layer.tiles, textureLookup);
    case "imagelayer":
      throw new Error("Not implemented");
    case "objectgroup":
      return renderTileObjects(layer.objects, textureLookup);
  }
}
