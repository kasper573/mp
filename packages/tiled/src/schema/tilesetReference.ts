import type { Type } from "@mp/schema";
import { customAsync, object, parse, string } from "@mp/schema";
import { loaderContexts } from "../context";
import { tileset as tilesetSchema, type Tileset } from "./tileset";
import { globalTileID } from "./common";

export const tilesetReference: Type<Tileset> = customAsync(
  async (data): Promise<Tileset> => {
    let tileset = parse(tilesetSchema, data);
    if (!tileset) {
      const file = parse(tilesetFile, data);

      const loaderContext = loaderContexts.get(root);
      if (!loaderContext) {
        throw new Error("No loader context available for this object");
      }

      const json = await loaderContext.loadTileset(file.source);
      tileset = parse(tilesetSchema, json);
    }

    return tileset;
  },
);

const tilesetFile = object({
  firstgid: globalTileID,
  source: string,
});
