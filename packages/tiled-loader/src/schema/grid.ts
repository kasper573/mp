import { object, fallback } from "@mp/schema";
import type { Orientation, TileUnit } from "./common";
import { orientation, tileUnit } from "./common";

export const grid = object({
  height: tileUnit,
  width: tileUnit,
  orientation: fallback(orientation, "orthogonal"),
});

export interface Grid {
  height: TileUnit;
  width: TileUnit;
  orientation: Orientation;
}
