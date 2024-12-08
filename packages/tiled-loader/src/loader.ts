import { err, ok, type Result } from "@mp/state";
import type { LoaderContext } from "./context.ts";
import type { TiledMap } from "./schema/map.ts";
import { reconcileTiledMap } from "./reconciliation/reconcileTiledMap.ts";

export type CreateTiledLoaderOptions = Omit<LoaderContext, "basePath">;

export function createTiledLoader(options: CreateTiledLoaderOptions) {
  return async function loadTiled(mapPath: string): Promise<TiledLoaderResult> {
    const context: LoaderContext = {
      basePath: mapPath,
      ...options,
    };

    try {
      const tiledMap = (await context.loadJson(mapPath)) as TiledMap;
      await reconcileTiledMap(context, tiledMap);
      return ok(tiledMap);
    } catch (error) {
      return err(error);
    }
  };
}

export type TiledLoaderResult = Result<TiledMap, unknown>;
