import { style, atoms } from "@mp/style";

export const debugText = style([
  atoms({
    whiteSpace: "pre-wrap",
    position: "absolute",
    padding: "l",
    borderRadius: "m",
    pointerEvents: "none",
    userSelect: "none",
  }),
  {
    top: 8,
    left: 8,
    width: "min(300px, 90vw)",
    background: "rgba(0, 0, 0, 0.5)",
    color: "white",
  },
]);
