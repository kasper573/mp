import { globalFontFace } from "@vanilla-extract/css";
import { tokens } from "@mp/style";
import { interFontFaces } from "./font-faces";

globalFontFace(
  tokens.fontFaces.default,
  interFontFaces.map(({ fontStyle, fontWeight, format, url }) => ({
    src: `url(${url}) format("${format}")`,
    fontStyle,
    fontWeight,
    fontDisplay: "swap",
  })),
);
