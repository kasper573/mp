import type { Color } from "./common.ts";

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
