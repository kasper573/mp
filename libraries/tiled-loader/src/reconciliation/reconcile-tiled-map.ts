import type { LoaderContext } from "../context";
import type { TiledMap } from "../schema/map";
import { reconcileLayer } from "./reconcile-layer";
import { reconcileTileset } from "./reconcile-tileset";

/**
 * The original map data in the tiled files is almost matching our
 * data structure but needs some adjustments to be fully compatible.
 */
export async function reconcileTiledMap(
  context: LoaderContext,
  map: TiledMap,
): Promise<void> {
  // Tilesets must be reconciled first because they are referenced by layers
  await Promise.all(
    map.tilesets.map(async (tileset, i) => {
      map.tilesets[i] = await reconcileTileset(context, tileset);
    }),
  );

  await Promise.all(
    map.layers.map((layer) => reconcileLayer(context, layer, map)),
  );
}
