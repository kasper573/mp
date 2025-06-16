import { atoms, style } from "@mp/style";

export const container = style([
  atoms({
    display: "flex",
  }),
  {
    height: "100vh",
    width: "100vw",
  },
]);

export const sidebar = style([
  atoms({
    borderColor: "surface.face_subtle",
    backgroundColor: "surface.base",
    color: "surface.face",
    borderWidth: "thin",
    borderStyle: "solid",
    padding: "xl",
  }),
  {
    width: "300px",
    minWidth: "300px",
    borderRight: "1px solid",
    borderLeft: "none",
    borderTop: "none", 
    borderBottom: "none",
    overflowY: "auto",
  },
]);

export const gameGrid = style([
  atoms({
    flex: 1,
  }),
  {
    backgroundColor: "#000",
  },
]);

export const section = style([
  atoms({
    marginBottom: "2xl",
  }),
]);

export const playerItem = style([
  atoms({
    display: "flex",
    alignItems: "center",
    padding: "m",
    backgroundColor: "surface.raised",
    borderRadius: "m",
    marginBottom: "s",
    borderWidth: "thin",
    borderStyle: "solid",
    borderColor: "surface.face_subtle",
  }),
  {
    justifyContent: "space-between",
  },
]);

export const spectatedPlayerItem = style([
  atoms({
    display: "flex",
    alignItems: "center", 
    padding: "s",
    borderRadius: "s",
    marginBottom: "xs",
    borderWidth: "thin",
    borderStyle: "solid",
  }),
  {
    justifyContent: "space-between",
    backgroundColor: "#e3f2fd",
    borderColor: "#90caf9",
  },
]);

export const playerInfo = style([
  atoms({
    flex: 1,
  }),
]);

export const playerName = style([
  atoms({
    fontSize: "s",
  }),
  {
    fontWeight: "600",
  },
]);

export const playerArea = style([
  atoms({
    color: "surface.face_subtle",
    marginTop: "2xs",
  }),
  {
    fontSize: "12px",
  },
]);
