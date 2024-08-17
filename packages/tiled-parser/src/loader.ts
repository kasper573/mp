import type { SafeParseResult, Schema } from "@mp/schema";
import { parseAsync } from "@mp/schema";
import type { LoaderContext } from "./context";
import type { TiledMap } from "./schema/map";
import { tiledMap } from "./schema/map";

export function createTiledLoader(context: LoaderContext) {
  return async (
    mapPath: string,
  ): Promise<SafeParseResult<Schema<TiledMap>>> => {
    const json = await context.loadMap(mapPath);
    const result = await parseAsync(tiledMap(context), json);
    return result;
  };
}
