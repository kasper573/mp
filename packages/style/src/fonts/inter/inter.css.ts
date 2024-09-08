import { fontFace } from "@vanilla-extract/css";
import inter100woff2 from "./inter-latin-100-normal.woff2";
import inter200woff2 from "./inter-latin-200-normal.woff2";
import inter300woff2 from "./inter-latin-300-normal.woff2";
import inter400woff2 from "./inter-latin-400-normal.woff2";
import inter500woff2 from "./inter-latin-500-normal.woff2";
import inter600woff from "./inter-latin-600-normal.woff";
import inter900woff2 from "./inter-latin-900-normal.woff2";
import inter700woff2 from "./inter-latin-700-normal.woff2";
import inter800woff2 from "./inter-latin-800-normal.woff2";

export const inter = fontFace([
  {
    src: src(inter100woff2),
    fontStyle: "normal",
    fontWeight: 100,
  },
  {
    src: src(inter200woff2),
    fontStyle: "normal",
    fontWeight: 200,
  },
  {
    src: src(inter300woff2),
    fontStyle: "normal",
    fontWeight: 300,
  },
  {
    src: src(inter400woff2),
    fontStyle: "normal",
    fontWeight: 400,
  },
  {
    src: src(inter500woff2),
    fontStyle: "normal",
    fontWeight: 500,
  },
  {
    src: src(inter600woff),
    fontStyle: "normal",
    fontWeight: 600,
  },
  {
    src: src(inter700woff2),
    fontStyle: "normal",
    fontWeight: 700,
  },
  {
    src: src(inter800woff2),
    fontStyle: "normal",
    fontWeight: 800,
  },
  {
    src: src(inter900woff2),
    fontStyle: "normal",
    fontWeight: 900,
  },
]);

function src(url: string, format = "woff2") {
  return `url(${url}) format("${format}")`;
}
