import { err, ok, type Result } from "@mp/std";
import * as v from "valibot";
import type { LoaderContext } from "../context";
import { TiledMapSchema, type TiledMap } from "./map";

export type CreateValidatedTiledLoaderOptions = Omit<LoaderContext, "basePath">;

export function createValidatedTiledLoader(
  options: CreateValidatedTiledLoaderOptions,
) {
  return async function loadTiled(
    mapPath: string,
  ): Promise<ValidatedTiledLoaderResult> {
    const context: LoaderContext = {
      basePath: mapPath,
      ...options,
    };

    try {
      // Load the raw JSON data
      const rawData = await context.loadJson(mapPath);

      // Parse and transform with valibot
      const tiledMap = v.parse(TiledMapSchema, rawData);

      // TODO: Run reconciliation on the parsed data
      // await reconcileTiledMap(context, tiledMap);

      return ok(tiledMap);
    } catch (error) {
      return err(error);
    }
  };
}

export type ValidatedTiledLoaderResult = Result<TiledMap, unknown>;
