import type { Schema } from "@mp/schema";
import { object, pipe, string, transform, union, parse } from "@mp/schema";
import type { LoaderContext } from "../context";
import { createError } from "../error";
import { tileset as tilesetSchema, type Tileset } from "./tileset";
import { globalTileID } from "./common";

export function tilesetReference(context: LoaderContext): Schema<Tileset> {
  return union([
    tilesetSchema(context),
    tilesetFile(context),
  ]) as Schema<Tileset>;
}

const file = object({
  firstgid: globalTileID,
  source: string,
});

function tilesetFile(context: LoaderContext): Schema<Tileset> {
  return pipe(
    file,
    transform(async ({ source, firstgid }) => {
      try {
        const tileset = (await context.loadTileset(source)) as Tileset;
        return await parse(tilesetSchema(context), { ...tileset, firstgid });
      } catch (error) {
        throw `Error in ${source}: ${createError(error)}`;
      }
    }),
  ) as Schema<Tileset>;
}
