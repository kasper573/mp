import { fontFace } from "@vanilla-extract/css";
import { interFontFaces } from "./font-faces";

export const inter = fontFace(
  interFontFaces.map(({ fontStyle, fontWeight, format, url }) => ({
    src: `url(${url}) format("${format}")`,
    fontStyle,
    fontWeight,
    fontDisplay: "swap",
  })),
);
