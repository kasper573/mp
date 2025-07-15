import type { GroupLayer, Layer, TiledMap } from "@mp/tiled-loader";
import { Container } from "@mp/graphics";
import type { TiledTextureLookup } from "./spritesheet";
import { createTileLayerRenderer } from "./tile-layer-renderer";
import { createObjectRenderer } from "./tile-object-renderer";

export function createTiledRenderer(opt: {
  map: TiledMap;
  textureLookup: TiledTextureLookup;
}): Container {
  return createNestedLayerRenderer(opt.map.layers);

  function createNestedLayerRenderer(layers: Layer[]): Container {
    const container = new Container({
      isRenderGroup: true,
      sortableChildren: true,
    });

    // layers are already in the draw order in the tiled data
    for (const [index, layer] of layers.entries()) {
      const layerRenderer = createLayerRenderer(layer);
      layerRenderer.position.set(layer.offsetx, layer.offsety);
      layerRenderer.label = layer.name;
      container.addChildAt(layerRenderer, index);
    }

    return container;
  }

  function createGroupLayerRenderer(layer: GroupLayer): Container {
    return createNestedLayerRenderer(layer.layers);
  }

  function createLayerRenderer(layer: Layer): Container {
    switch (layer.type) {
      case "group":
        return createGroupLayerRenderer(layer);
      case "tilelayer":
        return createTileLayerRenderer(layer.tiles, opt.textureLookup);
      case "imagelayer":
        throw new Error("Not implemented");
      case "objectgroup":
        return createObjectRenderer(layer.objects, opt.textureLookup);
    }
  }
}
