import type { LocalTileId } from "./common";
import type { Property } from "./property";

export interface Terrain {
  name: string;
  properties: Property[];
  tile: LocalTileId;
}
