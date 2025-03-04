import type { AnyErrorFormatter } from "@mp-modules/trpc";
import { opt } from "../options";

export const errorFormatter: AnyErrorFormatter = ({ shape }) => {
  if (opt.exposeErrorDetails) {
    return shape;
  }

  // Hide error details
  return {
    ...shape,
    data: { ...shape.data, path: undefined, stack: undefined },
    message: "An error occurred",
  };
};
