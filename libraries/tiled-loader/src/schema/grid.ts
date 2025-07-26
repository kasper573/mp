import type { Tile } from "@mp/std";
import type { Orientation } from "./common";

export interface Grid {
  height: Tile;
  width: Tile;
  orientation: Orientation;
}
