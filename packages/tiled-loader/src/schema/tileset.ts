import type { TypeOf } from "@mp/schema";
import {
  array,
  object,
  optional,
  string,
  fallback,
  picklist,
  pipe,
  transform,
} from "@mp/schema";
import type { LoaderContext } from "../context";
import type { LocalTileId } from "./common";
import {
  color,
  globalTileID,
  image,
  pixelUnit,
  pixelVector,
  rgb,
  tiledClass,
  tileUnit,
} from "./common";
import { property } from "./property";
import { wangSet } from "./wang";
import { terrain } from "./terrain";
import type { Tile } from "./tile";
import { tile } from "./tile";
import { transformations } from "./transformations";
import { grid } from "./grid";

export type FillMode = TypeOf<typeof fillMode>;
export const fillMode = picklist(["stretch", "preserve-aspect-fit"]);

export type ObjectAlignment = TypeOf<typeof objectAlignment>;
export const objectAlignment = picklist([
  "unspecified",
  "topleft",
  "top",
  "topright",
  "left",
  "center",
  "right",
  "bottomleft",
  "bottom",
  "bottomright",
]);

export type TileRenderSize = TypeOf<typeof tileRenderSize>;
export const tileRenderSize = picklist(["tile", "grid"]);

export type Tileset = TypeOf<ReturnType<typeof tileset>>;
export function tileset(context: LoaderContext) {
  return object({
    backgroundcolor: optional(color),
    class: optional(tiledClass),
    columns: tileUnit,
    fillmode: fallback(fillMode, "stretch"),
    firstgid: fallback(globalTileID, 1),
    grid: optional(grid),

    image: image(context),
    imageheight: pixelUnit,
    imagewidth: pixelUnit,

    /**
     * Buffer between image edge and first tile (pixels)
     */
    margin: pixelUnit,

    name: string,
    objectalignment: fallback(objectAlignment, "unspecified"),

    properties: optional(array(property(context))),

    /**
     * Spacing between adjacent tiles in image (pixels)
     */
    spacing: pixelUnit,

    terrains: optional(array(terrain(context))),

    /**
     * The number of tiles in this tileset
     */
    tilecount: tileUnit,

    /**
     * The Tiled version used to save the file
     */
    tiledversion: string,

    /**
     * Maximum height of tiles in this set
     */
    tileheight: optional(tileUnit),
    /**
     * Maximum width of tiles in this set
     */
    tilewidth: optional(tileUnit),

    tileoffset: optional(pixelVector),

    tilerendersize: fallback(tileRenderSize, "tile"),

    tiles: pipe(
      optional(array(tile(context))),
      transform(async (tiles = []): Promise<Map<LocalTileId, Tile>> => {
        const tileById = new Map<LocalTileId, Tile>();
        for (const tile of tiles) {
          tileById.set(tile.id, tile);
        }
        return tileById;
      }),
    ),

    /**
     * Allowed transformations
     */
    transformations: optional(transformations),

    transparentcolor: optional(rgb),

    /**
     * The JSON format version
     */
    version: optional(string),

    wangsets: optional(array(wangSet(context))),
  });
}
