import type { Tile } from "@mp/std";

export interface ViewDistanceSettings {
  readonly tileCount: Tile;
}

export const viewDistance: ViewDistanceSettings = {
  tileCount: 24 as Tile,
};
