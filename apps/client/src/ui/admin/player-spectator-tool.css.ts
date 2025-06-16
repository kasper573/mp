import { style } from "@vanilla-extract/css";

export const container = style({
  display: "flex",
  height: "100vh",
  width: "100vw",
});

export const sidebar = style({
  width: "300px",
  minWidth: "300px",
  backgroundColor: "#f5f5f5",
  padding: "20px",
  borderRight: "1px solid #ddd",
  overflowY: "auto",
});

export const gameGrid = style({
  flex: 1,
  backgroundColor: "#000",
});

export const section = style({
  marginBottom: "30px",
});

export const playerItem = style({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "10px",
  backgroundColor: "white",
  borderRadius: "6px",
  marginBottom: "8px",
  border: "1px solid #ddd",
});

export const spectatedPlayerItem = style({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "8px",
  backgroundColor: "#e3f2fd",
  borderRadius: "4px",
  marginBottom: "6px",
  border: "1px solid #90caf9",
});

export const playerInfo = style({
  flex: 1,
});

export const playerName = style({
  fontWeight: "600",
  fontSize: "14px",
});

export const playerArea = style({
  fontSize: "12px",
  color: "#666",
  marginTop: "2px",
});
