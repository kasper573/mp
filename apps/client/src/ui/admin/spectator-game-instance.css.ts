import { style } from "@vanilla-extract/css";

export const container = style({
  width: "100%",
  height: "100%",
  display: "flex",
  flexDirection: "column",
  backgroundColor: "#000",
});

export const header = style({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "8px 12px",
  backgroundColor: "#1a1a1a",
  borderBottom: "1px solid #333",
  minHeight: "32px",
});

export const playerName = style({
  color: "#fff",
  fontSize: "12px",
  fontWeight: "600",
  flex: 1,
});

export const error = style({
  color: "#ff4444",
  fontSize: "10px",
  fontWeight: "500",
});

export const loading = style({
  color: "#888",
  fontSize: "10px",
  fontWeight: "500",
});

export const gameContainer = style({
  flex: 1,
  position: "relative",
  overflow: "hidden",
});

export const fallback = style({
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  height: "100%",
  color: "#888",
});