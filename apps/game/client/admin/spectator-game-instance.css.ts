import { atoms, style } from "@mp/style";

export const container = style([
  atoms({
    width: "100%",
    height: "100%",
    display: "flex",
    flexDirection: "column",
  }),
  {
    backgroundColor: "#000",
  },
]);

export const header = style([
  atoms({
    display: "flex",
    alignItems: "center",
    padding: "s",
    borderBottom: "thin",
  }),
  {
    justifyContent: "space-between",
    backgroundColor: "#1a1a1a",
    borderBottomColor: "#333",
    minHeight: "32px",
  },
]);

export const playerName = style([
  atoms({
    color: "surface.face",
    flex: 1,
  }),
  {
    fontSize: "12px",
    fontWeight: "600",
  },
]);

export const error = style([
  {
    color: "#ff4444",
    fontSize: "10px",
    fontWeight: "500",
  },
]);

export const loading = style([
  atoms({
    color: "surface.face_subtle",
  }),
  {
    fontSize: "10px",
    fontWeight: "500",
  },
]);

export const gameContainer = style([
  atoms({
    flex: 1,
    position: "relative",
  }),
  {
    overflow: "hidden",
  },
]);

export const fallback = style([
  atoms({
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    height: "100%",
    color: "surface.face_subtle",
  }),
]);
