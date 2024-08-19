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
import type {
  GlobalTileId,
  ImageFile,
  LocalTileId,
  PixelUnit,
  PixelVector,
  RGB,
  TiledClass,
  TileUnit,
} from "./common";
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
import type { WangSet } from "./wang";
import { wangSet } from "./wang";
import { terrain } from "./terrain";
import type { Tile } from "./tile";
import { createEmptyTile, tile } from "./tile";
import type { Transformations } from "./transformations";
import { transformations } from "./transformations";
import type { Grid } from "./grid";
import { grid } from "./grid";

export type FillMode = "stretch" | "preserve-aspect-fit";
export const fillMode = picklist(["stretch", "preserve-aspect-fit"]);

export type ObjectAlignment =
  | "unspecified"
  | "topleft"
  | "top"
  | "topright"
  | "left"
  | "center"
  | "right"
  | "bottomleft"
  | "bottom"
  | "bottomright";

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

export type TileRenderSize = "tile" | "grid";
export const tileRenderSize = picklist(["tile", "grid"]);

export interface Tileset {
  backgroundcolor?: string;
  class?: TiledClass;
  columns: TileUnit;
  fillmode: FillMode;
  firstgid: GlobalTileId;
  grid?: Grid;

  image: ImageFile;
  imageheight: PixelUnit;
  imagewidth: PixelUnit;

  /**
   * Buffer between image edge and first tile (pixels)
   */
  margin: PixelUnit;

  name: string;
  objectalignment: ObjectAlignment;
  properties?: ReturnType<typeof property>[];

  /**
   * Spacing between adjacent tiles in image (pixels)
   */
  spacing: PixelUnit;
  terrains?: ReturnType<typeof terrain>[];

  /**
   * The number of tiles in this tileset
   */
  tilecount: TileUnit;

  /**
   * The Tiled version used to save the file
   */
  tiledversion: string;

  /**
   * Maximum height of tiles in this set
   */
  tileheight?: TileUnit;

  /**
   * Maximum width of tiles in this set
   */
  tilewidth?: TileUnit;

  tileoffset?: PixelVector;
  tilerendersize: TileRenderSize;

  tiles: Map<LocalTileId, Tile>;

  /**
   * Allowed transformations
   */
  transformations?: Transformations;

  transparentcolor?: RGB;

  /**
   * The JSON format version
   */
  version?: string;

  wangsets?: WangSet[];
}

export function tileset(context: LoaderContext) {
  const tileSchema = tile(context);
  const base = object({
    backgroundcolor: optional(color),
    class: optional(tiledClass),
    columns: tileUnit,
    fillmode: fallback(fillMode, "stretch"),
    firstgid: globalTileID,
    grid: optional(grid),

    image: image(context),
    imageheight: pixelUnit,
    imagewidth: pixelUnit,

    margin: pixelUnit,

    name: string,
    objectalignment: fallback(objectAlignment, "unspecified"),

    properties: optional(array(property(context))),

    spacing: pixelUnit,

    terrains: optional(array(terrain(context))),

    tilecount: tileUnit,

    tiledversion: string,

    tileheight: optional(tileUnit),

    tilewidth: optional(tileUnit),

    tileoffset: optional(pixelVector),

    tilerendersize: fallback(tileRenderSize, "tile"),

    tiles: pipe(
      optional(array(tileSchema)),
      transform(async (tiles = []): Promise<Map<LocalTileId, Tile>> => {
        const tileById = new Map<LocalTileId, Tile>();
        for (const tile of tiles) {
          tileById.set(tile.id, tile);
        }
        return tileById;
      }),
    ),

    transformations: optional(transformations),

    transparentcolor: optional(rgb),

    version: optional(string),

    wangsets: optional(array(wangSet(context))),
  });

  return pipe(
    base,
    transform(async (tileset) => {
      for (
        let localId: LocalTileId = 0;
        localId < tileset.tilecount;
        localId++
      ) {
        if (!tileset.tiles.has(localId)) {
          tileset.tiles.set(localId, createEmptyTile(localId));
        }
      }
      return tileset;
    }),
  );
}
