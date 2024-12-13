import { keyframes, style } from "@vanilla-extract/css";

const left = keyframes({
  "0%": { transform: "scale(0)" },
  "100%": { transform: "scale(1)" },
});

const mid = keyframes({
  "0%": { transform: "translate(0, 0)" },
  "100%": { transform: "translate(24px, 0)" },
});

const right = keyframes({
  "0%": { transform: "scale(1)" },
  "100%": { transform: "scale(0)" },
});

export const container = style({
  display: "inline-block",
  position: "relative",
  width: "80px",
  height: "80px",
});

const dot = style({
  boxSizing: "border-box",
  position: "absolute",
  top: "33.33333px",
  width: "13.33333px",
  height: "13.33333px",
  borderRadius: "50%",
  background: "currentColor",
  animationTimingFunction: "cubic-bezier(0, 1, 1, 0)",
});

export const dot1 = style([
  dot,
  {
    left: "8px",
    animation: `${left} 0.6s infinite`,
  },
]);

export const dot2 = style([
  dot,
  {
    left: "8px",
    animation: `${mid} 0.6s infinite`,
  },
]);

export const dot3 = style([
  dot,
  {
    left: "32px",
    animation: `${mid} 0.6s infinite`,
  },
]);

export const dot4 = style([
  dot,
  {
    left: "56px",
    animation: `${right} 0.6s infinite`,
  },
]);
