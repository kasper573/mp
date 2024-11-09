import { atoms, globalStyle, tokens, style } from "@mp/style";

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
  ...tokens.typography.body2,
});

export const right = style([
  row,
  atoms({
    marginLeft: "auto",
  }),
]);
