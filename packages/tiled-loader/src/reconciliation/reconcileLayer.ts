import type { LoaderContext } from "../context.ts";
import type { Layer, TileLayer } from "../schema/layer.ts";
import type { TiledMap } from "../schema/map.ts";
import { reconcileFilePath } from "./reconcileFilePath.ts";
import {
  decompressTileLayer,
  isCompressedTileLayer,
} from "./decompressTileLayer.ts";
import { reconcileObject } from "./reconcileObject.ts";
import { reconcileProperties } from "./reconcileProperties.ts";

/**
 * Since layers contain data that needs to be reconciled,
 * we need to do this for each layer in the map.
 */
export async function reconcileLayer(
  context: LoaderContext,
  layer: Layer,
  map: TiledMap
): Promise<void> {
  const promises: Promise<unknown>[] = [];

  reconcileProperties(layer);

  switch (layer.type) {
    case "imagelayer":
      layer.image = reconcileFilePath(context, layer.image);
      break;
    case "objectgroup":
      for (const [i, object] of layer.objects.entries()) {
        layer.objects[i] = reconcileObject(object);
      }
      break;
    case "group":
      promises.push(
        ...layer.layers.map((child) => reconcileLayer(context, child, map))
      );
      break;
    case "tilelayer": {
      if (isCompressedTileLayer(layer)) {
        (layer as TileLayer).tiles = decompressTileLayer(layer, map);
      }
    }
  }

  await Promise.all(promises);
}
