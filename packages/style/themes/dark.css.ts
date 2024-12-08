import { createTheme } from "@vanilla-extract/css";
import { themeContract } from "../src/theme.css";
import { palette } from "../src/tokens.ts";

const darkValues = {
  color: {
    primary: {
      hover: palette.blue["400"],
      base: palette.blue["500"],
      active: palette.blue["600"],
      face_subtle: palette.blue["800"],
      face: palette.blue["950"],
    },
    secondary: {
      hover: palette.blue["200"],
      base: palette.blue["300"],
      active: palette.blue["400"],
      face_subtle: palette.blue["800"],
      face: palette.blue["950"],
    },
    success: {
      hover: palette.green["400"],
      base: palette.green["500"],
      active: palette.green["600"],
      face_subtle: palette.green["800"],
      face: palette.green["950"],
    },
    warning: {
      hover: palette.orange["300"],
      base: palette.orange["400"],
      active: palette.orange["500"],
      face_subtle: palette.orange["800"],
      face: palette.orange["950"],
    },
    error: {
      hover: palette.red["400"],
      base: palette.red["500"],
      active: palette.red["600"],
      face_subtle: palette.red["800"],
      face: palette.red["950"],
    },
    info: {
      hover: palette.gray["200"],
      base: palette.gray["300"],
      active: palette.gray["400"],
      face_subtle: palette.gray["800"],
      face: palette.gray["950"],
    },
    tint: palette.black["50"],
    highlight: palette.white["50"],
    surface: {
      hover: palette.gray["800"],
      base: palette.gray["900"],
      active: palette.gray["950"],
      face_subtle: palette.gray["200"],
      face: palette.gray["50"],
    },
  },
};

export const dark: string = createTheme(themeContract, darkValues);
