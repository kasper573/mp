import { atoms, recipe, style } from "@mp/style";

export const inventory = atoms({
  position: "absolute",
  top: "l",
  right: "l",
  padding: "xl",
  backgroundColor: "tint",
  borderRadius: "m",
});

export const label = style([
  atoms({
    position: "absolute",
  }),
  {
    top: 0,
    right: 0,
    transform: "translateY(-50%)",
  },
]);

export const itemGrid = style([
  atoms({
    display: "grid",
    gap: "l",
    overflowY: "auto",
  }),
  {
    gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
    maxHeight: 190,
  },
]);

export const itemTile = recipe({
  base: atoms({ padding: "m" }),
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
      loading: atoms({}),
    },
  },
});
