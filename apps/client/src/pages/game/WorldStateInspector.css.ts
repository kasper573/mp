import { style, atoms } from "@mp/style";

export const worldStateInspector = style([
  atoms({
    whiteSpace: "pre-wrap",
    position: "absolute",
    padding: "l",
    borderRadius: "m",
    userSelect: "none",
    overflowY: "auto",
  }),
  {
    top: 8,
    right: 8,
    width: "min(300px, 90vw)",
    maxHeight: "min(500px, 90vh)",
    background: "rgba(0, 0, 0, 0.5)",
    color: "white",
  },
]);
