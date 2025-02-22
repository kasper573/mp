import type { LocalTileId } from "./common.ts";
import type { Property } from "./property.ts";

export interface Terrain {
  name: string;
  properties: Map<string, Property>;
  tile: LocalTileId;
}
