import { atoms, recipe } from "@mp/style";

export const debugText = recipe({
  base: [
    atoms({
      whiteSpace: "pre-wrap",
      position: "absolute",
      padding: "m",
      borderRadius: "m",
      pointerEvents: "none",
    }),
    {
      top: 8,
      left: 8,
      background: "rgba(0, 0, 0, 0.5)",
      color: "white",
    },
  ],
  variants: {
    visible: {
      true: atoms({ display: "block" }),
      false: atoms({ display: "none" }),
    },
  },
});
