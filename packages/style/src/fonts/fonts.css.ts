import { globalFontFace } from "@vanilla-extract/css";
import { interFontFaces } from "./inter/font-faces";
import { interFontFamily } from "./fonts";

// We register fonts using globalFontFace so that @mp/style can be imported on the server without having vanilla-extract

globalFontFace(
  interFontFamily,
  interFontFaces.map(({ fontStyle, fontWeight, format, url }) => ({
    src: `url(${url}) format("${format}")`,
    fontStyle,
    fontWeight,
  })),
);
