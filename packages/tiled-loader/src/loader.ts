import { err, ok, type Result } from "@mp/std";
import * as v from "valibot";
import type { LoaderContext } from "./context";
import { reconcileTiledMap } from "./reconciliation/reconcile-tiled-map";
import { TiledMapSchema, type TiledMap } from "./schemas/map";

export type CreateTiledLoaderOptions = Omit<LoaderContext, "basePath">;

export function createTiledLoader(options: CreateTiledLoaderOptions) {
  return async function loadTiled(mapPath: string): Promise<TiledLoaderResult> {
    const context: LoaderContext = {
      basePath: mapPath,
      ...options,
    };

    try {
      // Load the raw JSON data
      const rawData = await context.loadJson(mapPath);

      // Parse and transform with valibot
      const tiledMap = v.parse(TiledMapSchema, rawData);

      // Run reconciliation on the parsed data
      await reconcileTiledMap(context, tiledMap);

      return ok(tiledMap);
    } catch (error) {
      return err(error);
    }
  };
}

export type TiledLoaderResult = Result<TiledMap, unknown>;
