import type { Schema } from "@mp/schema";
import { customAsync, object, parse, string } from "@mp/schema";
import type { LoaderContext } from "../context";
import { tileset as tilesetSchema, type Tileset } from "./tileset";
import { globalTileID } from "./common";

export function tilesetReference(context: LoaderContext): Schema<Tileset> {
  return customAsync(async (data): Promise<Tileset> => {
    let tileset = parse(tilesetSchema, data);

    if (!tileset) {
      const file = parse(tilesetFile, data);
      const json = await context.loadTileset(file.source);
      tileset = parse(tilesetSchema, json);
    }

    return tileset;
  });
}

const tilesetFile = object({
  firstgid: globalTileID,
  source: string,
});
