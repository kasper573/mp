import type { LoaderContext } from "../context";
import type { Layer, TileLayer } from "../schema/layer";
import type { TiledMap } from "../schema/map";
import { reconcileFilePath } from "./reconcileFilePath";
import {
  decompressTileLayer,
  isCompressedTileLayer,
} from "./decompressTileLayer";
import { reconcileTileset } from "./reconcileTileset";

export async function reconcileLayer(
  context: LoaderContext,
  layer: Layer,
  map: TiledMap,
): Promise<void> {
  const promises: Promise<unknown>[] = [];

  switch (layer.type) {
    case "imagelayer":
      layer.image = reconcileFilePath(context, layer.image);
      break;
    case "objectgroup":
      promises.push(
        ...layer.objects.map(async (object) => {
          if ("template" in object && object.tileset) {
            object.tileset = await reconcileTileset(context, object.tileset);
          }
        }),
      );
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
