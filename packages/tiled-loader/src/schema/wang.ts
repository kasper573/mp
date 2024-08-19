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
import type { LocalTileId, TiledClass } from "./common";
import { color, localTileID, tiledClass } from "./common";
import type { Property } from "./property";
import { property } from "./property";

export interface WangColor {
  class?: TiledClass;
  color: string;
  name: string;
  probability: number;
  properties?: Property[];
  tile: LocalTileId;
}

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

export type WangColorIndex = number;

export const wangColorIndex = uchar;

export interface WangTile {
  tileid: LocalTileId;
  wangid: [
    WangColorIndex,
    WangColorIndex,
    WangColorIndex,
    WangColorIndex,
    WangColorIndex,
    WangColorIndex,
    WangColorIndex,
    WangColorIndex,
  ];
}

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

export interface WangSet {
  class?: TiledClass;
  colors?: Record<WangColorIndex, WangColor>;
  name: string;
  properties?: Property[];
  tile: LocalTileId;
  type: "corner" | "edge" | "mixed";
  wangtiles: WangTile[];
}

export function wangSet(context: LoaderContext) {
  return object({
    class: optional(tiledClass),
    colors: optional(array(wangColor(context))),
    name: string,
    properties: optional(array(property(context))),
    tile: localTileID,
    type: picklist(["corner", "edge", "mixed"]),
    wangtiles: array(wangTile),
  });
}
