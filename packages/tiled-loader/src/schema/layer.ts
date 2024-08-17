import type { Schema, TypeOf } from "@mp/schema";
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
} from "@mp/schema";
import type { LoaderContext } from "../context";
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
import { property } from "./property";
import { tiledObject } from "./object";
import { chunk } from "./chunk";

export type LayerDrawOrder = TypeOf<typeof layerDrawOrder>;
export const layerDrawOrder = picklist(["topdown", "index"]);

const sharedProperties = {
  class: optional(tiledClass),
  id: layerId,
  locked: fallback(boolean, false),
  name: string,
  offsetx: fallback(pixelUnit, 0),
  offsety: fallback(pixelUnit, 0),
  opacity: float,
  parallaxx: fallback(float, 1),
  parallaxy: fallback(float, 1),
  properties: optional(array(property)),
  visible: boolean,

  // coordinate where layer content starts (for infinite maps)
  startx: optional(pixelUnit),
  starty: optional(pixelUnit),

  /**
   * multiplied with any graphics drawn by this layer or any child layers
   */
  tintcolor: optional(color),

  /**
   * Horizontal layer offset in tiles. Always 0.
   */
  x: tileUnit,

  /**
   * Vertical layer offset in tiles. Always 0.
   */
  y: tileUnit,
};

export type TileLayer = TypeOf<typeof tileLayer>;
export const tileLayer = object({
  type: literal("tilelayer"),
  chunks: optional(array(chunk)),
  compression: fallback(compression, Compression.None),
  data,
  encoding: fallback(encoding, "csv"),

  /**
   * Row count. Same as map height for fixed-size maps.
   */
  height: tileUnit,

  /**
   * Column count. Same as map width for fixed-size maps.
   */
  width: tileUnit,
  ...sharedProperties,
});

export type ImageLayer = TypeOf<typeof imageLayer>;
export const imageLayer = object({
  type: literal("imagelayer"),
  image,
  repeatx: boolean,
  repeaty: boolean,
  transparentcolor: optional(rgb),
  ...sharedProperties,
});

export type ObjectGroupLayer = TypeOf<ReturnType<typeof objectGroupLayer>>;
export function objectGroupLayer(context: LoaderContext) {
  return object({
    type: literal("objectgroup"),
    draworder: fallback(layerDrawOrder, "topdown"),
    objects: array(tiledObject(context)),
    ...sharedProperties,
  });
}

const sharedObj = object(sharedProperties);

export type GroupLayer = TypeOf<typeof sharedObj> & {
  type: "group";
  layers: Layer[];
};

export function groupLayer(context: LoaderContext): Schema<GroupLayer> {
  return object({
    type: literal("group"),
    layers: lazy(() => array(layer(context))),
    ...sharedProperties,
  });
}

export type Layer = GroupLayer | TileLayer | ImageLayer | ObjectGroupLayer;

export function layer(context: LoaderContext): Schema<Layer> {
  return lazy((input): Schema<Layer> => {
    if (input && typeof input === "object" && "type" in input) {
      switch (input.type as Layer["type"]) {
        case "group":
          return groupLayer(context);
        case "tilelayer":
          return tileLayer;
        case "imagelayer":
          return imageLayer;
        case "objectgroup":
          return objectGroupLayer(context);
      }
    }
    throw new Error(`Not a layer type: ${input}`);
  });
}
