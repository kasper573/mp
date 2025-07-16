import { err, ok, type Result } from "@mp/std";
import type { LoaderContext } from "./context";
import type { TiledMap } from "./schema/map";

export type CreateTiledLoaderOptions = Omit<LoaderContext, "basePath">;

export function createTiledLoader(options: CreateTiledLoaderOptions) {
  return async function loadTiled(mapPath: string): Promise<TiledLoaderResult> {
    const context: LoaderContext = {
      basePath: mapPath,
      ...options,
    };

    try {
      const tiledMap = (await context.loadJson(mapPath)) as TiledMap;
      // TODO: Reconciliation removed for now - use vector loader for new functionality
      return ok(tiledMap);
    } catch (error) {
      return err(error);
    }
  };
}

export type TiledLoaderResult = Result<TiledMap, unknown>;
