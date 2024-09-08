import { atoms, globalStyle, recipe, tokens } from "@mp/style";

export const nav = atoms({
  backgroundColor: "info.base",
  color: "info.face",
  display: "flex",
  flexDirection: "row",
  alignItems: "center",
  gap: "2xl",
  padding: "xl",
});

globalStyle(`${nav} a`, {
  color: "inherit",
  textDecoration: "none",
  display: "inline-flex",
  ...tokens.typography.body2,
});

export const connectionIndicator = recipe({
  base: atoms({
    width: "s",
    height: "s",
    borderRadius: "circle",
    marginLeft: "auto",
    border: "thin",
  }),
  variants: {
    connected: {
      true: atoms({
        backgroundColor: "success.base",
        borderColor: "success.face_subtle",
      }),
      false: atoms({
        backgroundColor: "error.base",
        borderColor: "error.face_subtle",
      }),
    },
  },
});
