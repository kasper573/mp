import { object } from "@mp/schema";
import type { TiledData, TileUnit } from "./common";
import { data, tileUnit } from "./common";

export const chunk = object({
  data,
  height: tileUnit,
  width: tileUnit,
  x: tileUnit,
  y: tileUnit,
});

export interface Chunk {
  data: TiledData;
  height: TileUnit;
  width: TileUnit;
  x: TileUnit;
  y: TileUnit;
}
