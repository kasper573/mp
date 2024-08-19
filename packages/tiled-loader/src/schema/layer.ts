import type { Schema } from "@mp/schema";
import {
  array,
  boolean,
  float,
  lazy,
  literal,
  object,
  optional,
  string,
  fallback,
  picklist,
  intersection,
  pipe,
  unknown,
  transform,
} from "@mp/schema";
import type { LoaderContext } from "../context";
import type {
  Color,
  Encoding,
  ImageFile,
  LayerId,
  PixelUnit,
  Ratio,
  RGB,
  TiledClass,
  TiledData,
  TileUnit,
} from "./common";
import {
  color,
  Compression,
  compression,
  data,
  encoding,
  image,
  layerId,
  pixelUnit,
  rgb,
  tiledClass,
  tileUnit,
} from "./common";
import type { Property } from "./property";
import { property } from "./property";
import type { TiledObject } from "./object";
import { tiledObject } from "./object";
import { chunk, type Chunk } from "./chunk";

export type LayerDrawOrder = "topdown" | "index";
export const layerDrawOrder = picklist(["topdown", "index"]);

export interface SharedLayerProperties {
  class?: TiledClass;
  id: LayerId;
  locked: boolean;
  name: string;
  offsetx: PixelUnit;
  offsety: PixelUnit;
  opacity: Ratio;
  parallaxx: Ratio;
  parallaxy: Ratio;
  properties?: Property[];
  visible: boolean;

  // coordinate where layer content starts (for infinite maps)
  startx?: PixelUnit;
  starty?: PixelUnit;

  /**
   * multiplied with any graphics drawn by this layer or any child layers
   */
  tintcolor?: Color;

  /**
   * Horizontal layer offset in tiles. Always 0.
   */
  x: TileUnit;

  /**
   * Vertical layer offset in tiles. Always 0.
   */
  y: TileUnit;
}

function sharedProperties(context: LoaderContext) {
  return object({
    class: optional(tiledClass),
    id: layerId,
    locked: fallback(boolean, false),
    name: string,
    offsetx: fallback(pixelUnit, 0),
    offsety: fallback(pixelUnit, 0),
    opacity: float,
    parallaxx: fallback(float, 1),
    parallaxy: fallback(float, 1),
    properties: optional(array(property(context))),
    visible: boolean,

    startx: optional(pixelUnit),
    starty: optional(pixelUnit),

    tintcolor: optional(color),

    x: tileUnit,

    y: tileUnit,
  });
}

export interface TileLayer extends SharedLayerProperties {
  type: "tilelayer";
  chunks?: Chunk[];
  compression: Compression;
  data: TiledData;
  encoding: Encoding;

  /**
   * Row count. Same as map height for fixed-size maps.
   */
  height: TileUnit;

  /**
   * Column count. Same as map width for fixed-size maps.
   */
  width: TileUnit;
}

export function tileLayer(context: LoaderContext) {
  return intersection([
    object({
      type: literal("tilelayer"),
      chunks: optional(
        array(
          pipe(
            unknown(),
            transform(async (o) => chunk(o)),
          ),
        ),
      ),
      compression: fallback(compression, Compression.None),
      data,
      encoding: fallback(encoding, "csv"),
      height: tileUnit,
      width: tileUnit,
    }),
    sharedProperties(context),
  ]);
}

export interface ImageLayer extends SharedLayerProperties {
  type: "imagelayer";
  image: ImageFile;
  repeatx: boolean;
  repeaty: boolean;
  transparentcolor?: RGB;
}

export function imageLayer(context: LoaderContext) {
  return intersection([
    object({
      type: literal("imagelayer"),
      image: image(context),
      repeatx: boolean,
      repeaty: boolean,
      transparentcolor: optional(rgb),
    }),
    sharedProperties(context),
  ]);
}

export interface ObjectGroupLayer extends SharedLayerProperties {
  type: "objectgroup";
  draworder: LayerDrawOrder;
  objects: TiledObject[];
}

export function objectGroupLayer(context: LoaderContext) {
  return intersection([
    object({
      type: literal("objectgroup"),
      draworder: fallback(layerDrawOrder, "topdown"),
      objects: array(tiledObject(context)),
    }),
    sharedProperties(context),
  ]);
}

export interface GroupLayer extends SharedLayerProperties {
  type: "group";
  layers: Layer[];
}

export function groupLayer(context: LoaderContext): Schema<GroupLayer> {
  return intersection([
    object({
      type: literal("group"),
      layers: lazy(() => array(layer(context))),
    }),
    sharedProperties(context),
  ]);
}

export type Layer = GroupLayer | TileLayer | ImageLayer | ObjectGroupLayer;

export function layer(context: LoaderContext): Schema<Layer> {
  return lazy((input): Schema<Layer> => {
    if (input && typeof input === "object" && "type" in input) {
      switch (input.type as Layer["type"]) {
        case "group":
          return groupLayer(context);
        case "tilelayer":
          return tileLayer(context);
        case "imagelayer":
          return imageLayer(context);
        case "objectgroup":
          return objectGroupLayer(context);
      }
    }
    throw new Error(`Not a layer type: ${input}`);
  });
}
