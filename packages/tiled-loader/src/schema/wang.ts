import type { Schema, TypeOf } from "@mp/schema";
import {
  array,
  object,
  string,
  float,
  optional,
  uchar,
  tuple,
  picklist,
} from "@mp/schema";
import { color, localTileID, tiledClass } from "./common";
import { property } from "./property";

export type WangColor = TypeOf<typeof wangColor>;
export const wangColor = object({
  class: optional(tiledClass),
  color,
  name: string,
  probability: float,
  properties: array(property),
  tile: localTileID,
});

export type WangColorIndex = TypeOf<typeof wangColorIndex>;
export const wangColorIndex = uchar;

export type WangTile = TypeOf<typeof wangTile>;
export const wangTile = object({
  tileid: localTileID,
  wangid: tuple([
    wangColorIndex,
    wangColorIndex,
    wangColorIndex,
    wangColorIndex,
    wangColorIndex,
    wangColorIndex,
    wangColorIndex,
    wangColorIndex,
  ]),
});

export type WangSet = TypeOf<typeof wangSet>;
export const wangSet = object({
  class: optional(tiledClass),
  colors: array(wangColor) as Schema<Record<WangColorIndex, WangColor>>,
  name: string,
  properties: array(property),
  tile: localTileID,
  type: picklist(["corner", "edge", "mixed"]),
  wangtiles: array(wangTile),
});
