import type { LoaderContext } from "./context";
import type { TiledMap } from "./schema/map";
import { reconcileTiledMap } from "./reconciliation/reconcileTiledMap";

export type CreateTiledLoaderOptions = Omit<LoaderContext, "basePath">;

export function createTiledLoader(options: CreateTiledLoaderOptions) {
  return async function loadTiled(mapPath: string): Promise<TiledLoaderResult> {
    const context: LoaderContext = {
      basePath: mapPath,
      ...options,
    };

    try {
      const tiledMap = (await context.loadJson(mapPath)) as TiledMap;
      for await (const _ of reconcileTiledMap(context, tiledMap));
      return { tiledMap };
    } catch (error) {
      return {
        error: `Error in ${mapPath}: ${error}`,
      };
    }
  };
}

export interface TiledLoaderResult {
  tiledMap?: TiledMap;
  error?: string;
}
