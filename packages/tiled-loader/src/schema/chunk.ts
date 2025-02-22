import type { Tile } from "@mp/std";
import type { TiledData } from "./common.ts";

export interface Chunk {
  data: TiledData;
  height: Tile;
  width: Tile;
  x: Tile;
  y: Tile;
}
