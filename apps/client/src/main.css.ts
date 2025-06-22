import { globalStyle, theme, style, tokens } from "@mp/style";
import "./assets/fonts/inter/inter.css";

globalStyle(`html, body`, {
  overflow: "hidden",
  background: theme.color.surface.base,
  color: theme.color.surface.face,
  margin: 0,
  padding: 0,
  width: "100%",
  height: "100%",
  ...tokens.typography.body,
});

export const root = style({
  width: "100%",
  height: "100%",
  display: "flex",
  flexDirection: "column",
});
