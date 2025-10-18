import { atoms, cssForAnimation, keyframes, recipe, style } from "@mp/style";

export const inventory = atoms({
  position: "absolute",
  top: "l",
  right: "l",
  backgroundColor: "tint",
  borderRadius: "m",
});

export const label = style([
  atoms({
    position: "absolute",
  }),
  {
    top: 0,
    left: 0,
    transform: "translateY(-50%)",
  },
]);

export const itemGrid = style([
  atoms({
    display: "grid",
    gap: "l",
    padding: "l",
    overflowY: "auto",
  }),
  {
    gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
    maxHeight: 190,
  },
]);

const pulse = keyframes({
  "0%": { opacity: 0.5 },
  "50%": { opacity: 1 },
  "100%": { opacity: 0.5 },
});

export const itemTile = recipe({
  base: [
    atoms({
      padding: "m",
      whiteSpace: "nowrap",
      textOverflow: "ellipsis",
      overflow: "hidden",
      boxSizing: "border-box",
      borderRadius: "s",
    }),
    { width: 100, height: 25 },
  ],
  variants: {
    type: {
      equipment: atoms({
        backgroundColor: "info.base",
        color: "info.face",
      }),
      consumable: atoms({
        backgroundColor: "primary.base",
        color: "primary.face",
      }),
      loading: [
        atoms({
          backgroundColor: "highlight",
          opacity: 0.5,
        }),
        {
          animation: cssForAnimation([pulse, "extraLong5", "linear"]),
        },
      ],
    },
  },
});
