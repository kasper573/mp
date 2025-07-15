import type {
  GroupLayer,
  Layer,
  ObjectGroupLayer,
  TiledMap,
} from "@mp/tiled-loader";
import { Container } from "@mp/graphics";
import { createObjectRenderer } from "./tile-object-renderer";
import type { TiledTextureLookup } from "./spritesheet";
import { createTileLayerRenderer } from "./tile-layer-renderer";

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
      layerRenderer.label = layer.name;
      container.addChildAt(layerRenderer, index);
    }

    return container;
  }

  function createGroupLayerRenderer(layer: GroupLayer): Container {
    return createNestedLayerRenderer(layer.layers);
  }

  function createObjectGroupLayerRenderer(layer: ObjectGroupLayer): Container {
    const renderedObjectGroup = new Container({
      isRenderGroup: true,
      sortableChildren: true,
    });

    for (const obj of layer.objects) {
      const renderedObject = createObjectRenderer(obj, {
        textureLookup: opt.textureLookup,
        tileHeight: opt.map.tileheight,
      });
      if (renderedObject) {
        renderedObjectGroup.addChild(renderedObject);
      }
    }

    return renderedObjectGroup;
  }

  function createLayerRenderer(layer: Layer): Container {
    switch (layer.type) {
      case "group":
        return createGroupLayerRenderer(layer);
      case "tilelayer":
        return createTileLayerRenderer(layer, opt.textureLookup);
      case "imagelayer":
        throw new Error("Not implemented");
      case "objectgroup":
        return createObjectGroupLayerRenderer(layer);
    }
  }
}
