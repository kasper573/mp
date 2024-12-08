import type { Orientation, TileNumber } from "./common.ts";

export interface Grid {
  height: TileNumber;
  width: TileNumber;
  orientation: Orientation;
}
