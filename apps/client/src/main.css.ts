import { globalStyle, style } from "@vanilla-extract/css";
import { typography } from "./style/tokens.ts";
import { themeContract } from "./style/themeContract.css.ts";

globalStyle(`html, body`, {
  overflow: "hidden",
  background: themeContract.color.surface.base,
  color: themeContract.color.surface.face,
  margin: 0,
  padding: 0,
  width: "100%",
  height: "100%",
  ...typography.body,
});

export const root = style({
  width: "100%",
  height: "100%",
  display: "flex",
  flexDirection: "column",
});
