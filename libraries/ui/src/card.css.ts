import { atoms, recipe } from "@mp/style";

export const card = recipe({
  base: atoms({
    borderRadius: "m",
    padding: "l",
  }),
  variants: {
    intent: {
      info: atoms({
        backgroundColor: "info.base",
        color: "info.face",
      }),
      error: atoms({
        backgroundColor: "error.base",
        color: "error.face",
      }),
      success: atoms({
        backgroundColor: "success.base",
        color: "success.face",
      }),
    },
    floating: {
      true: atoms({ boxShadow: "m" }),
    },
  },
  defaultVariants: {
    intent: "info",
  },
});
