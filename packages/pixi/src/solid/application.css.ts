import { atoms, globalStyle, style } from "@mp/style";

export const container = atoms({
  position: "relative",
});

const contentBase = style({});

export const content = style([
  contentBase,
  atoms({
    position: "absolute",
    inset: 0,
    pointerEvents: "none",
  }),
]);

globalStyle(`${contentBase} > *`, {
  pointerEvents: "auto",
});
