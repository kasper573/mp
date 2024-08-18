import { parse } from "@mp/schema";
import type { JsonLoader, LoaderContext } from "./context";
import type { TiledMap } from "./schema/map";
import { tiledMap } from "./schema/map";
import { createError } from "./error";

export interface CreateTiledLoaderOptions {
  loadMap: JsonLoader<[mapPath: string]>;
  loadTileset: JsonLoader<[tilesetPath: string, mapPath: string]>;
}

export function createTiledLoader({
  loadMap,
  loadTileset,
}: CreateTiledLoaderOptions) {
  return async function loadTiled(mapPath: string): Promise<TiledLoaderResult> {
    const context: LoaderContext = {
      loadTileset: (tilesetPath) => loadTileset(tilesetPath, mapPath),
    };

    let json;
    try {
      json = await loadMap(mapPath);
      return { tiledMap: await parse(tiledMap(context), json) };
    } catch (error) {
      return {
        error: `Error in ${mapPath}: ${createError(error)}`,
      };
    }
  };
}

export interface TiledLoaderResult {
  tiledMap?: TiledMap;
  error?: string;
}
