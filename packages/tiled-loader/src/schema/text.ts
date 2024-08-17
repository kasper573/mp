import type { TypeOf } from "@mp/schema";
import {
  boolean,
  integer,
  object,
  string,
  union,
  fallback,
  picklist,
} from "@mp/schema";
import { rgb, argb } from "./common";

export type TiledText = TypeOf<typeof text>;
export const text = object({
  bold: fallback(boolean, false),
  color: fallback(union([rgb, argb]), "#000000"),
  fontfamily: fallback(string, "sans-serif"),
  halign: fallback(picklist(["center", "right", "justify", "left"]), "left"),
  italic: fallback(boolean, false),
  kerning: fallback(boolean, true),
  pixelsize: fallback(integer, 16),
  strikeout: fallback(boolean, false),
  text: string,
  underline: fallback(boolean, false),
  valign: fallback(picklist(["top", "center", "bottom"]), "top"),
  wrap: fallback(boolean, false),
});
