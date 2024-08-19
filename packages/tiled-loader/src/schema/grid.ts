import type { Orientation, TileNumber } from "./common";

export interface Grid {
  height: TileNumber;
  width: TileNumber;
  orientation: Orientation;
}
