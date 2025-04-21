import { style, atoms } from "@mp/style";

export const debugMenu = style([
  atoms({
    whiteSpace: "pre-wrap",
    position: "absolute",
    padding: "l",
    borderRadius: "m",
    userSelect: "none",
    pointerEvents: "all",
  }),
  {
    top: 8,
    left: 8,
    minWidth: "min(300px, 90vw)",
    background: "rgba(0, 0, 0, 0.5)",
    color: "white",
  },
]);

export const debugText = style([
  atoms({ overflow: "auto" }),
  { maxHeight: "70vh" },
]);
