import { globalStyle, style } from "@vanilla-extract/css";
import { atoms } from "../style/atoms.css.ts";
import { typography } from "../style/tokens.ts";

const row = atoms({
  display: "flex",
  flexDirection: "row",
  alignItems: "center",
  gap: "2xl",
});

export const nav = style([
  row,
  atoms({
    backgroundColor: "info.base",
    color: "info.face",
    padding: "xl",
  }),
]);

globalStyle(`${nav} a`, {
  color: "inherit",
  textDecoration: "none",
  display: "inline-flex",
  ...typography.body2,
});

export const right = style([
  row,
  atoms({
    marginLeft: "auto",
  }),
]);
