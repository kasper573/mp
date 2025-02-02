import { fontFace } from "@vanilla-extract/css";
import { interFontFaces } from "./inter";

export const inter = fontFace(
  interFontFaces.map(({ fontStyle, fontWeight, format, url }) => ({
    src: `url(${url}) format("${format}")`,
    fontStyle,
    fontWeight,
  })),
);
