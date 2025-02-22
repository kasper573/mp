import { fontFace } from "npm:@vanilla-extract/css";
import { interFontFaces } from "./inter.ts";

export const inter = fontFace(
  interFontFaces.map(({ fontStyle, fontWeight, format, url }) => ({
    src: `url(${url}) format("${format}")`,
    fontStyle,
    fontWeight,
  })),
);
