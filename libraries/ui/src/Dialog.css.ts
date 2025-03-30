import { atoms, recipe } from "@mp/style";

export const dialog = recipe({
  base: [
    atoms({
      backgroundColor: "surface.base",
      color: "surface.face",
      borderRadius: "l",
      padding: "2xl",
      border: "thin",
      borderColor: "surface.face_subtle",
      position: "absolute",
      top: "50%",
      left: "50%",
      display: "block",
    }),
    {
      margin: 0,
      transform: "translate(-50%, -50%)",
    },
  ],
  variants: {
    open: {
      true: atoms({
        opacity: 1,
        transition: "appearance.emphasized.enter",
      }),
      false: atoms({
        opacity: 0,
        pointerEvents: "none",
        transition: "appearance.emphasized.exit",
      }),
    },
  },
  defaultVariants: {
    open: false,
  },
});
