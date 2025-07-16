import { err, ok, type Result } from "@mp/std";
import type { LoaderContext } from "./context";
import type { TiledMap } from "./schema/map";
import type { VectorTiledMap } from "./schema/map";
import { reconcileTiledMap } from "./reconciliation/reconcile-tiled-map";
import { transformMapToVector } from "./reconciliation/transform-to-vector";

export type CreateVectorTiledLoaderOptions = Omit<LoaderContext, "basePath">;

/**
 * Creates a loader that produces Vector-based tiled maps for better performance and convenience
 */
export function createVectorTiledLoader(
  options: CreateVectorTiledLoaderOptions,
) {
  return async function loadVectorTiled(
    mapPath: string,
  ): Promise<VectorTiledLoaderResult> {
    const context: LoaderContext = {
      basePath: mapPath,
      ...options,
    };

    try {
      // Load the raw tiled map
      const tiledMap = (await context.loadJson(mapPath)) as TiledMap;

      // Perform legacy reconciliation first
      await reconcileTiledMap(context, tiledMap);

      // Transform to Vector-based types for better performance
      const vectorMap = transformMapToVector(tiledMap);

      return ok(vectorMap);
    } catch (error) {
      return err(error);
    }
  };
}

export type VectorTiledLoaderResult = Result<VectorTiledMap, unknown>;
