import {
  boolean,
  integer,
  object,
  string,
  union,
  fallback,
  picklist,
} from "@mp/schema";
import type { Color } from "./common";
import { rgb, argb } from "./common";

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

export interface TiledText {
  bold: boolean;
  color: Color;
  fontfamily: string;
  halign: "center" | "right" | "justify" | "left";
  italic: boolean;
  kerning: boolean;
  pixelsize: number;
  strikeout: boolean;
  text: string;
  underline: boolean;
  valign: "top" | "center" | "bottom";
  wrap: boolean;
}
