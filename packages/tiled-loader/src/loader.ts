import { parse } from "@mp/schema";
import type { LoaderContext } from "./context";
import type { TiledMap } from "./schema/map";
import { tiledMap } from "./schema/map";
import { createError } from "./error";

export type CreateTiledLoaderOptions = Omit<LoaderContext, "basePath">;

export function createTiledLoader(options: CreateTiledLoaderOptions) {
  return async function loadTiled(mapPath: string): Promise<TiledLoaderResult> {
    const context: LoaderContext = {
      basePath: mapPath,
      ...options,
    };

    let json;
    try {
      json = await context.loadJson(mapPath);
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
