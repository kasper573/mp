import type { CustomParserResult, Schema } from "@mp/schema";
import { customAsync, object, parse, string } from "@mp/schema";
import type { LoaderContext } from "../context";
import { tileset as tilesetSchema, type Tileset } from "./tileset";
import { globalTileID } from "./common";

export function tilesetReference(context: LoaderContext): Schema<Tileset> {
  return customAsync<Tileset>(
    async (data): Promise<CustomParserResult<Tileset>> => {
      const tilesetResult = parse(tilesetSchema(context), data);
      if (tilesetResult.success) {
        return tilesetResult;
      }

      const fileResult = parse(tilesetFile, data);
      if (!fileResult.success) {
        return { success: false, issues: fileResult.issues };
      }

      let json: unknown;
      try {
        json = await context.loadTileset(fileResult.output.source);
      } catch (error) {
        return {
          success: false,
          issues: [`Failed to load tileset: ${error}`],
        };
      }

      return parse(tilesetSchema(context), json);
    },
  );
}

const tilesetFile = object({
  firstgid: globalTileID,
  source: string,
});
