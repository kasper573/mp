import { keyframes, atoms, recipe } from "@mp/style";

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
