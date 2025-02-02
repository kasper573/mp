import type { CSSProperties } from "@vanilla-extract/css";
import { flattened } from "./flattened";
import { themeContract } from "./theme.css";
import { inter } from "./fonts/inter/inter.css";

const cssDefaults = {
  auto: "auto",
  inherit: "inherit",
};

export const palette = {
  blue: {
    "50": "rgb(245, 250, 254)",
    "100": "rgb(231, 243, 254)",
    "200": "rgb(211, 234, 253)",
    "300": "rgb(187, 223, 251)",
    "400": "rgb(168, 213, 250)",
    "500": "rgb(144, 202, 249)",
    "600": "rgb(71, 167, 245)",
    "700": "rgb(12, 128, 223)",
    "800": "rgb(8, 86, 150)",
    "900": "rgb(4, 42, 73)",
    "950": "rgb(2, 22, 39)",
  },
  green: {
    "50": "rgb(233, 246, 239)",
    "100": "rgb(215, 239, 226)",
    "200": "rgb(175, 223, 197)",
    "300": "rgb(132, 205, 166)",
    "400": "rgb(92, 189, 137)",
    "500": "rgb(65, 160, 110)",
    "600": "rgb(52, 127, 87)",
    "700": "rgb(38, 94, 64)",
    "800": "rgb(27, 65, 45)",
    "900": "rgb(13, 33, 22)",
    "950": "rgb(6, 15, 10)",
  },
  red: {
    "50": "rgb(251, 236, 233)",
    "100": "rgb(248, 220, 216)",
    "200": "rgb(240, 182, 173)",
    "300": "rgb(233, 148, 134)",
    "400": "rgb(226, 113, 96)",
    "500": "rgb(218, 75, 54)",
    "600": "rgb(185, 54, 34)",
    "700": "rgb(138, 40, 25)",
    "800": "rgb(90, 26, 17)",
    "900": "rgb(47, 14, 9)",
    "950": "rgb(22, 6, 4)",
  },
  orange: {
    "50": "rgb(253, 247, 237)",
    "100": "rgb(250, 237, 214)",
    "200": "rgb(245, 221, 178)",
    "300": "rgb(240, 202, 138)",
    "400": "rgb(234, 184, 97)",
    "500": "rgb(229, 167, 58)",
    "600": "rgb(203, 138, 27)",
    "700": "rgb(153, 104, 20)",
    "800": "rgb(104, 71, 14)",
    "900": "rgb(50, 34, 7)",
    "950": "rgb(27, 18, 4)",
  },
  gray: {
    "50": "rgb(233, 237, 242)",
    "100": "rgb(210, 220, 228)",
    "200": "rgb(165, 185, 202)",
    "300": "rgb(121, 150, 175)",
    "400": "rgb(84, 114, 141)",
    "500": "rgb(57, 78, 96)",
    "600": "rgb(46, 62, 77)",
    "700": "rgb(34, 47, 58)",
    "800": "rgb(23, 31, 38)",
    "900": "rgb(11, 16, 19)",
    "950": "rgb(6, 8, 10)",
  },
  teal: {
    "50": "rgb(232, 248, 247)",
    "100": "rgb(209, 240, 239)",
    "200": "rgb(162, 226, 223)",
    "300": "rgb(112, 210, 206)",
    "400": "rgb(65, 195, 190)",
    "500": "rgb(48, 151, 148)",
    "600": "rgb(38, 120, 117)",
    "700": "rgb(28, 89, 87)",
    "800": "rgb(20, 62, 61)",
    "900": "rgb(10, 31, 30)",
    "950": "rgb(5, 15, 15)",
  },
  white: {
    "100": "rgb(255, 255, 255)",
    "87": "rgba(255, 255, 255, 0.87)",
    "50": "rgba(255, 255, 255, 0.50)",
    "25": "rgba(255, 255, 255, 0.25)",
  },
  black: {
    "100": "rgb(0, 0, 0)",
    "87": "rgba(0, 0, 0, 0.87)",
    "50": "rgba(0, 0, 0, 0.50)",
    "25": "rgba(0, 0, 0, 0.25)",
  },
};

export const colors = {
  ...flattened(themeContract.color),
  transparent: "transparent",
  current: "currentColor",
  ...cssDefaults,
};

export const spacing = {
  0: 0,
  xs: 1,
  s: 2,
  m: 4,
  l: 8,
  xl: 16,
  "2xl": 24,
  "3xl": 40,
  ...cssDefaults,
};

export const radius = {
  s: 2,
  m: 4,
  circle: 9999,
  l: 8,
  ...cssDefaults,
};

export const sizes = {
  xs: 12,
  s: 16,
  m: 24,
  l: 32,
  xl: 48,
  "2xl": 64,
  0: 0,
  1: "1px",
  "25%": "25%",
  "50%": "50%",
  "75%": "75%",
  "100%": "100%",
  "min-content": "min-content",
  "max-content": "max-content",
  ...cssDefaults,
};

export const shadows = {
  none: "none",
  s: "0px 2px 4px rgba(0, 0, 0, 0.1)",
  m: "0px 4px 8px rgba(0, 0, 0, 0.1)",
};

export const fontFaces = {
  default: inter,
};

export const typography = {
  caption: { fontFamily: fontFaces.default, fontSize: 11 },
  label: { fontFamily: fontFaces.default, fontSize: 12 },
  body: { fontFamily: fontFaces.default, fontSize: 14 },
  body2: { fontFamily: fontFaces.default, fontSize: 13 },
  h1: { fontFamily: fontFaces.default, fontSize: 24 },
  h2: { fontFamily: fontFaces.default, fontSize: 22 },
  h3: { fontFamily: fontFaces.default, fontSize: 20 },
  h4: { fontFamily: fontFaces.default, fontSize: 18 },
  h5: { fontFamily: fontFaces.default, fontSize: 16 },
  h6: { fontFamily: fontFaces.default, fontSize: 14 },
} satisfies Record<string, CSSProperties>;

export const borders = {
  none: "none",
  thin: "1px solid",
  thick: "2px solid",
};

export const transform = {
  none: "none",
  center: "translate(-50%, -50%)",
  ...cssDefaults,
};

export const flexes = [
  1,
  2,
  3,
  4,
  5,
  6,
  7,
  8,
  9,
  10,
  0,
  "none",
  "auto",
] as const;

export const overflows = ["visible", "hidden", "scroll", "auto"] as const;

export type Easing = keyof typeof easings;
export const easings = {
  emphasized: "cubic-bezier(0.2, 0, 0, 1)",
  emphasizedAccelerate: "cubic-bezier(0.3, 0, 0.8, 0.15)",
  emphasizedDecelerate: "cubic-bezier(0.05, 0.7, 0.1, 1)",
  standard: "cubic-bezier(0.2, 0, 0, 1)",
  standardAccelerate: "cubic-bezier(0.3, 0, 1, 1)",
  standardDecelerate: "cubic-bezier(0, 0, 0, 1)",
  legacy: "cubic-bezier(0.4, 0, 0.2, 1)",
  legacyAccelerate: "cubic-bezier(0.4, 0, 1, 1)",
  legacyDecelerate: "cubic-bezier(0, 0, 0.2, 1)",
  linear: "cubic-bezier(0, 0, 1, 1)",
} as const;

export type Duration = keyof typeof durations;
export const durations = {
  short1: "50ms",
  short2: "100ms",
  short3: "150ms",
  short4: "200ms",
  medium1: "250ms",
  medium2: "300ms",
  medium3: "350ms",
  medium4: "400ms",
  long1: "450ms",
  long2: "500ms",
  long3: "550ms",
  long4: "600ms",
  extraLong1: "700ms",
  extraLong2: "800ms",
  extraLong3: "900ms",
  extraLong4: "1000ms",
  extraLong5: "1500ms",
} as const;

export type Transition = {
  duration: (typeof durations)[Duration];
  easing: (typeof easings)[Easing];
};

export type Transitions = typeof transitions;
export const transitions = {
  "emphasized.beginAndEndOnScreen": {
    duration: durations.long2,
    easing: easings.emphasized,
  },
  "emphasized.enter": {
    duration: durations.medium4,
    easing: easings.emphasizedDecelerate,
  },
  "emphasized.exit": {
    duration: durations.short4,
    easing: easings.emphasizedAccelerate,
  },

  "standard.beginAndEndOnScreen": {
    duration: durations.medium2,
    easing: easings.standard,
  },
  "standard.enter": {
    duration: durations.medium1,
    easing: easings.standardDecelerate,
  },
  "standard.exit": {
    duration: durations.short4,
    easing: easings.standardAccelerate,
  },
} satisfies Record<string, Transition>;
