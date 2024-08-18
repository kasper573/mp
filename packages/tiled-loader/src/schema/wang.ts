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
import type { LoaderContext } from "../context";
import { color, localTileID, tiledClass } from "./common";
import { property } from "./property";

export type WangColor = TypeOf<ReturnType<typeof wangColor>>;
export function wangColor(context: LoaderContext) {
  return object({
    class: optional(tiledClass),
    color,
    name: string,
    probability: float,
    properties: optional(array(property(context))),
    tile: localTileID,
  });
}

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

export type WangSet = TypeOf<ReturnType<typeof wangSet>>;
export function wangSet(context: LoaderContext) {
  return object({
    class: optional(tiledClass),
    colors: optional(array(wangColor(context))) as Schema<
      Record<WangColorIndex, WangColor> | undefined
    >,
    name: string,
    properties: optional(array(property(context))),
    tile: localTileID,
    type: picklist(["corner", "edge", "mixed"]),
    wangtiles: array(wangTile),
  });
}
