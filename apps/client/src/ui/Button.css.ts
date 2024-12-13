import { atoms } from "../style/atoms.css.ts";

export const button = atoms({
  all: "unset",
  backgroundColor: {
    default: "primary.base",
    hover: "primary.hover",
    active: "primary.base",
  },
  color: "primary.face",
  border: "thin",
  borderColor: "primary.face_subtle",
  px: "l",
  py: "m",
  borderRadius: "m",
  cursor: "pointer",
});
