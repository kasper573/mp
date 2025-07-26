import { recipe } from "@vanilla-extract/recipes";
import { atoms } from "./atoms.css";

export const dock = recipe({
  base: atoms({
    position: "absolute",
  }),
  variants: {
    position: {
      top: atoms({ inset: 0, bottom: "auto" }),
    },
  },
});
