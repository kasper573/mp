import { atoms, style } from "@mp/style";

export const container = style([
  atoms({
    width: "100%",
    height: "100%",
    display: "flex",
    flexDirection: "column",
  }),
]);

export const grid = style([
  atoms({
    flex: 1,
    display: "grid",
    padding: "xs",
    width: "100%",
    height: "100%",
  }),
  {
    gap: "2px",
    backgroundColor: "#222",
  },
]);

export const gameSlot = style([
  atoms({
    border: "thin",
    borderRadius: "s",
    position: "relative",
  }),
  {
    backgroundColor: "#000",
    borderColor: "#333",
    overflow: "hidden",
    minHeight: "200px",
  },
]);

export const emptyState = style([
  atoms({
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    height: "100%",
    color: "surface.face_subtle",
    textAlign: "center",
    padding: "3xl",
  }),
]);

export const emptyStateTitle = style([
  atoms({
    marginBottom: "m",
  }),
  {
    margin: "0 0 10px 0",
    fontSize: "24px",
    fontWeight: "300",
  },
]);

export const emptyStateText = style([
  {
    margin: 0,
    fontSize: "16px",
    opacity: 0.8,
  },
]);
