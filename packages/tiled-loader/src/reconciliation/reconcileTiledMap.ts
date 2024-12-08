import type { LoaderContext } from "../context.ts";
import type { TiledMap } from "../schema/map.ts";
import { reconcileLayer } from "./reconcileLayer.ts";
import { reconcileTileset } from "./reconcileTileset.ts";

/**
 * The original map data in the tiled files is almost matching our
 * data structure but needs some adjustments to be fully compatible.
 */
export async function reconcileTiledMap(
  context: LoaderContext,
  map: TiledMap
): Promise<void> {
  // Tilesets must be reconciled first because they are referenced by layers
  await Promise.all(
    map.tilesets.map(async (tileset, i) => {
      map.tilesets[i] = await reconcileTileset(context, tileset);
    })
  );

  await Promise.all(
    map.layers.map((layer) => reconcileLayer(context, layer, map))
  );
}
