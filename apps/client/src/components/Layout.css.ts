import { atoms, globalStyle, tokens } from "@mp/style";

export const nav = atoms({
  backgroundColor: "info.base",
  color: "info.face",
  display: "flex",
  flexDirection: "row",
  gap: "2xl",
  padding: "xl",
});

globalStyle(`${nav} a`, {
  color: "inherit",
  textDecoration: "none",
  display: "inline-flex",
  ...tokens.typography.body2,
});
