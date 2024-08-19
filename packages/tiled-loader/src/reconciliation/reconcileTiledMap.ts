import type { LoaderContext } from "../context";
import type { TiledMap } from "../schema/map";
import { reconcileLayer } from "./reconcileLayer";
import { reconcileTileset } from "./reconcileTileset";

/**
 * The original map data in the tiled files is mostly directly matching our
 * data structure but needs some adjustments to be fully compatible.
 */
export async function* reconcileTiledMap(
  context: LoaderContext,
  map: TiledMap,
) {
  for (let i = 0; i < map.tilesets.length; i++) {
    yield await reconcileTileset(context, map.tilesets[i]).then((updated) => {
      map.tilesets[i] = updated;
    });
  }

  for (const layer of map.layers) {
    yield reconcileLayer(context, layer);
  }
}
