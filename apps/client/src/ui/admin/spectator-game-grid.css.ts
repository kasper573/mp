import { style } from "@vanilla-extract/css";

export const container = style({
  width: "100%",
  height: "100%",
  display: "flex",
  flexDirection: "column",
});

export const grid = style({
  flex: 1,
  display: "grid",
  gap: "2px",
  padding: "4px",
  backgroundColor: "#222",
  width: "100%",
  height: "100%",
});

export const gameSlot = style({
  backgroundColor: "#000",
  border: "1px solid #333",
  borderRadius: "4px",
  overflow: "hidden",
  position: "relative",
  minHeight: "200px",
});

export const emptyState = style({
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  height: "100%",
  color: "#ccc",
  textAlign: "center",
  padding: "40px",
});

export const emptyStateTitle = style({
  margin: "0 0 10px 0",
  fontSize: "24px",
  fontWeight: "300",
});

export const emptyStateText = style({
  margin: 0,
  fontSize: "16px",
  opacity: 0.8,
});
