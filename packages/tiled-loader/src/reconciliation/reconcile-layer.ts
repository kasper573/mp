import type { LoaderContext } from "../context";
import type { Layer, TileLayer } from "../schema/layer";
import type { TiledMap } from "../schema/map";
import { reconcileFilePath } from "./reconcile-file-path";
import {
  decompressTileLayer,
  isCompressedTileLayer,
} from "./decompress-tile-layer";
import { reconcileObject } from "./reconcile-object";
import { reconcileProperties } from "./reconcile-properties";

/**
 * Since layers contain data that needs to be reconciled,
 * we need to do this for each layer in the map.
 */
export async function reconcileLayer(
  context: LoaderContext,
  layer: Layer,
  map: TiledMap,
): Promise<void> {
  const promises: Promise<unknown>[] = [];

  reconcileProperties(layer);

  switch (layer.type) {
    case "imagelayer":
      layer.image = reconcileFilePath(context, layer.image);
      break;
    case "objectgroup":
      for (const [i, object] of layer.objects.entries()) {
        layer.objects[i] = reconcileObject(object, map.tileheight);
      }
      break;
    case "group":
      promises.push(
        ...layer.layers.map((child) => reconcileLayer(context, child, map)),
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
