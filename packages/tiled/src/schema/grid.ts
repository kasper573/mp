import type { TypeOf } from "@mp/schema";
import { object, fallback } from "@mp/schema";
import { orientation, tileUnit } from "./common";

export type Grid = TypeOf<typeof grid>;
export const grid = object({
  height: tileUnit,
  width: tileUnit,
  orientation: fallback(orientation, "orthogonal"),
});
