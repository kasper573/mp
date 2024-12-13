import { keyframes } from "@vanilla-extract/css";
import { recipe } from "@vanilla-extract/recipes";
import { atoms } from "../style/atoms.css.ts";

const scale = "400%";

const load = keyframes({
  "0%": { backgroundPositionX: "0%" },
  "100%": { backgroundPositionX: `-${scale}` },
});

export const container = recipe({
  base: [
    atoms({
      width: "100%",
      transition: "appearance.standard.beginAndEndOnScreen",
      color: "highlight",
    }),
    {
      height: 5,
      background:
        "linear-gradient(to right, transparent 0%, currentColor 50%, transparent 100%)",
      backgroundSize: `${scale} 100%`,
      animation: `${load} 4.5s infinite linear`,
    },
  ],
  variants: {
    active: {
      true: atoms({ opacity: 1 }),
      false: atoms({ opacity: 0 }),
    },
  },
  defaultVariants: {
    active: true,
  },
});
