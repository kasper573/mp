import { safeParseAsync } from "@mp/schema";
import type { LoaderContext } from "./context";
import { tiledMap } from "./schema/map";

export function createTiledLoader(context: LoaderContext) {
  return async (mapPath: string) => {
    const json = await context.loadMap(mapPath);
    const result = await safeParseAsync(tiledMap(context), json);
    return result;
  };
}