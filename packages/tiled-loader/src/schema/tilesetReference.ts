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
  const { basePath, loadJson, relativePath } = context;
  return pipe(
    file,
    transform(async ({ source, firstgid }) => {
      try {
        const absPath = relativePath(source, basePath);
        const json = (await loadJson(absPath)) as object;
        return await parse(tilesetSchema({ ...context, basePath: absPath }), {
          ...json,
          firstgid,
        });
      } catch (error) {
        throw `Error in ${source}: ${createError(error)}`;
      }
    }),
  ) as Schema<Tileset>;
}
