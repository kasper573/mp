import type { Tile } from "@mp/std";
import type { Orientation } from "./common.ts";

export interface Grid {
  height: Tile;
  width: Tile;
  orientation: Orientation;
}
