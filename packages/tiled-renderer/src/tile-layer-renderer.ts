import type { VectorTiledObjectTransformer } from "@mp/tiled-loader";
import { Vector } from "@mp/math";
import type { LayerWithVectors } from "@mp/tiled-loader";
import { objectsInVectorLayers } from "@mp/tiled-loader";
import { Container } from "@mp/graphics";
import type { TiledTextureLookup } from "./spritesheet";
import { renderLayerTilesSorted } from "./tile-renderer-sorted";
import { renderTileObject } from "./tile-object-renderer";
import type { Pixel } from "@mp/std";
import { assert } from "@mp/std";

export class TiledRenderer extends Container {
  constructor(
    layers: LayerWithVectors[],
    private dynamicLayerName: string,
    textureLookup: TiledTextureLookup,
  ) {
    super({ isRenderGroup: true });

    renderTiledLayersInto(this, layers, textureLookup);

    // Render tile objects into the dynamic layer to ensure they are depth sorted
    for (const obj of objectsInVectorLayers(layers, inheritVectorObjectOffset)) {
      const mesh = renderTileObject(obj, textureLookup);
      if (mesh) {
        this.dynamicLayer.addChild(mesh);
        mesh.zIndex = mesh.y;
      }
    }
  }

  get dynamicLayer() {
    return assert(this.getChildByLabel(this.dynamicLayerName));
  }
}

// Since we cant render nested object layers and apply their offsets that way,
// we need to inherit the offsets and apply manually to each object.
const inheritVectorObjectOffset: VectorTiledObjectTransformer = (obj, ancestry) => {
  return ancestry.reduce(
    (acc, layer) => {
      acc.x = (acc.x + layer.offset.x) as Pixel;
      acc.y = (acc.y + layer.offset.y) as Pixel;
      acc.position = new Vector(acc.x, acc.y);
      return acc;
    },
    { ...obj },
  );
};

function renderTiledLayers(
  layers: LayerWithVectors[],
  textureLookup: TiledTextureLookup,
): Container {
  const container = new Container({ isRenderGroup: true });
  renderTiledLayersInto(container, layers, textureLookup);
  return container;
}

function renderTiledLayersInto(
  container: Container,
  layers: LayerWithVectors[],
  textureLookup: TiledTextureLookup,
): void {
  // layers are already in the draw order in the tiled data
  for (const [index, layer] of layers.entries()) {
    const layerRenderer = renderTiledLayer(layer, textureLookup);
    if (layerRenderer) {
      layerRenderer.position.set(layer.offset.x, layer.offset.y);
      layerRenderer.label = layer.name;
      container.addChildAt(layerRenderer, index);
    }
  }
}
function renderTiledLayer(
  layer: LayerWithVectors,
  textureLookup: TiledTextureLookup,
): Container | undefined {
  switch (layer.type) {
    case "group":
      return renderTiledLayers(layer.layers ?? [], textureLookup);
    case "tilelayer":
      return renderLayerTilesSorted(layer.tiles ?? [], textureLookup);
    case "imagelayer":
      throw new Error("Not implemented");
    case "objectgroup":
      // We don't render object groups here. We can't render them nested they would get incorrectly depth sorted.
      // Technically we are supposed to be able to, using a RenderLayer, but i tried it and it didn't work,
      // so we do the current solution until we can make that work.
      return;
  }
}
