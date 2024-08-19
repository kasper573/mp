import type { LoaderContext } from "./context";
import type { TiledMap } from "./schema/map";
import type { LocalTileId, Pixel } from "./schema/common";
import type { Tile } from "./schema/tile";
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

export function createEmptyTile(id: LocalTileId): Tile {
  return {
    id,
    x: 0 as Pixel,
    y: 0 as Pixel,
  };
}
