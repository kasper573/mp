import { globalStyle, style } from "npm:@vanilla-extract/css";
import { theme } from "./style/theme.css.ts";
import { typography } from "./style/tokens.ts";

globalStyle(`html, body`, {
  overflow: "hidden",
  background: theme.color.surface.base,
  color: theme.color.surface.face,
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
