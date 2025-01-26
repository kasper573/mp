import type { TileNumber } from "@mp/std";
import type { Orientation } from "./common";

export interface Grid {
  height: TileNumber;
  width: TileNumber;
  orientation: Orientation;
}
