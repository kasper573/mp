import type { TiledData, TileNumber } from "./common.ts";

export interface Chunk {
  data: TiledData;
  height: TileNumber;
  width: TileNumber;
  x: TileNumber;
  y: TileNumber;
}
