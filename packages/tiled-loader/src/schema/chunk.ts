import type { TileNumber } from "@mp/std";
import type { TiledData } from "./common";

export interface Chunk {
  data: TiledData;
  height: TileNumber;
  width: TileNumber;
  x: TileNumber;
  y: TileNumber;
}
