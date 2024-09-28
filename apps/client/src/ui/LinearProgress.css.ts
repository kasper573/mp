import { keyframes, atoms, style, recipe } from "@mp/style";

const right = { left: "100%", right: "-90%" };
const load = keyframes({
  "0%": { left: "-30%", right: "100%" },
  "60%": right,
  "100%": right,
});

export const container = recipe({
  base: [
    { height: 5 },
    atoms({
      width: "100%",
      backgroundColor: "secondary.active",
      position: "relative",
      transition: "appearance.standard.beginAndEndOnScreen",
    }),
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

export const filled = style([
  atoms({
    backgroundColor: "secondary.hover",
    position: "absolute",
    inset: 0,
  }),
  {
    animation: `${load} 2s infinite`,
  },
]);
