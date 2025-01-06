import { atoms, recipe } from "@mp/style";

export const dock = recipe({
  base: {
    position: "absolute",
  },
  variants: {
    position: {
      center: [
        atoms({ top: "50%", left: "50%" }),
        { transform: "translate(-50%, -50%)" },
      ],
      topRight: atoms({ top: 0, right: 0 }),
    },
  },
});
