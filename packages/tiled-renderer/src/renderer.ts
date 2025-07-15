import type { GlobalTileId } from "@mp/tiled-loader";
import type {
  GroupLayer,
  Layer,
  ObjectGroupLayer,
  TiledMap,
} from "@mp/tiled-loader";
import { Container } from "@mp/graphics";
import type { TiledTextureLookup } from "./spritesheet";
import { createTileLayerRenderer } from "./tile-layer-renderer";
import { upsertMap } from "@mp/std";
import { renderStaticTiles } from "./tile-renderer";
import type { TileRenderData } from "./tile-mesh-data";

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

  // We only render objects that reference tiles via gid
  function createObjectGroupLayerRenderer(layer: ObjectGroupLayer): Container {
    const renderGroups = new Map<GlobalTileId, TileRenderData[]>();
    for (const obj of layer.objects) {
      if (obj.gid !== undefined) {
        upsertMap(renderGroups, obj.gid, {
          width: obj.width,
          height: obj.height,
          x: obj.x,
          y: obj.y,
          flags: obj.flags,
          rotation: (obj.rotation / 180) * Math.PI, // Convert degrees to radians
        });
      }
    }

    const container = new Container({ isRenderGroup: true });
    for (const mesh of renderStaticTiles(renderGroups, opt.textureLookup)) {
      container.addChild(mesh);
    }

    return container;
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
        return createObjectGroupLayerRenderer(layer);
    }
  }
}
