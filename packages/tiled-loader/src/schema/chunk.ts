import type { TiledData, TileUnit } from "./common";

export interface Chunk {
  data: TiledData;
  height: TileUnit;
  width: TileUnit;
  x: TileUnit;
  y: TileUnit;
}

export function chunk(obj: unknown): Chunk {
  return obj as Chunk;
}
