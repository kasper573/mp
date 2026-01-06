import { atoms, recipe } from "@mp/style";

export const button = recipe({
  base: atoms({
    all: "unset",
    backgroundColor: {
      default: "primary.base",
      hover: "primary.hover",
      active: "primary.base",
    },
    color: "primary.face",
    border: "thin",
    borderColor: "primary.face_subtle",
    px: "l",
    py: "m",
    borderRadius: "m",
    cursor: "pointer",
  }),
  variants: {
    disabled: {
      true: atoms({
        opacity: 0.4,
        pointerEvents: "none",
        userSelect: "none",
      }),
    },
  },
});
