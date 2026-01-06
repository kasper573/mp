import { atoms, recipe } from "@mp/style";

export const card = recipe({
  base: atoms({
    backgroundColor: "info.base",
    color: "info.face",
    borderRadius: "m",
    padding: "l",
  }),
  variants: {
    floating: {
      true: atoms({ boxShadow: "m" }),
    },
  },
});
