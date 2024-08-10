import { safeParseAsync } from "@mp/schema";
import type { LoaderContext } from "./context";
import { loaderContexts } from "./context";
import { tiledMap } from "./schema/map";

export function createTiledLoader(context: LoaderContext) {
  return async (mapPath: string) => {
    const json = await context.loadMap(mapPath);
    if (loaderContexts.has(json)) {
      throw new Error(
        "A loader context already exists for this JSON object. The json loader must return a new object each time.",
      );
    }
    loaderContexts.set(json, context);
    const result = await safeParseAsync(tiledMap, json);
    loaderContexts.delete(json);
    return result;
  };
}
