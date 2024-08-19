import type { LoaderContext } from "../context";
import type { Layer } from "../schema/layer";
import { reconcileFilePath } from "./reconcileFilePath";
import { reconcileTileset } from "./reconcileTileset";

export async function* reconcileLayer(
  context: LoaderContext,
  layer: Layer,
): AsyncGenerator {
  switch (layer.type) {
    case "imagelayer":
      layer.image = reconcileFilePath(context, layer.image);
      break;
    case "objectgroup":
      for (const object of layer.objects) {
        if ("template" in object && object.tileset) {
          yield await reconcileTileset(context, object.tileset).then(
            (updated) => {
              object.tileset = updated;
            },
          );
        }
      }
      break;
    case "group":
      for (const child of layer.layers) {
        yield reconcileLayer(context, child);
      }
      break;
  }
}
