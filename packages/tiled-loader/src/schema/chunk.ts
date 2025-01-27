import type { Tile } from "@mp/std";
import type { TiledData } from "./common";

export interface Chunk {
  data: TiledData;
  height: Tile;
  width: Tile;
  x: Tile;
  y: Tile;
}
