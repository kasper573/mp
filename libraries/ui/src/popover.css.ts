import { style, atoms, keyframes } from "@mp/style";

const slideUpAndFade = keyframes({
  from: {
    opacity: 0,
    transform: "translateY(2px)",
  },
  to: {
    opacity: 1,
    transform: "translateY(0)",
  },
});

const slideRightAndFade = keyframes({
  from: {
    opacity: 0,
    transform: "translateX(-2px)",
  },
  to: {
    opacity: 1,
    transform: "translateX(0)",
  },
});

const slideDownAndFade = keyframes({
  from: {
    opacity: 0,
    transform: "translateY(-2px)",
  },
  to: {
    opacity: 1,
    transform: "translateY(0)",
  },
});

const slideLeftAndFade = keyframes({
  from: {
    opacity: 0,
    transform: "translateX(2px)",
  },
  to: {
    opacity: 1,
    transform: "translateX(0)",
  },
});

export const content = style([
  atoms({ padding: "l" }),
  {
    animationDuration: "400ms",
    animationTimingFunction: "cubic-bezier(0.16, 1, 0.3, 1)",
    willChange: "transform, opacity",
    selectors: {
      '&[data-state="open"][data-side="top"]': {
        animationName: slideDownAndFade,
      },
      '&[data-state="open"][data-side="right"]': {
        animationName: slideLeftAndFade,
      },
      '&[data-state="open"][data-side="bottom"]': {
        animationName: slideUpAndFade,
      },
      '&[data-state="open"][data-side="left"]': {
        animationName: slideRightAndFade,
      },
    },
  },
]);

export const arrow = style({
  fill: "white",
});

export const close = style([
  atoms({
    borderRadius: "circle",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    position: "absolute",
  }),
  {
    all: "unset",
    fontFamily: "inherit",
    height: 25,
    width: 25,
    color: "var(--violet-11)",
    top: 5,
    right: 5,
    selectors: {
      "&:hover": {
        backgroundColor: "var(--violet-4)",
      },
      "&:focus": {
        boxShadow: "0 0 0 2px var(--violet-7)",
      },
    },
  },
]);
