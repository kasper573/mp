import type { Tile } from "@mp/std";
import type { ViewDistanceSettings } from "@mp/world";

export const viewDistance: ViewDistanceSettings = {
  renderedTileCount: 24 as Tile,
  networkFogOfWarTileCount: 32 as Tile,
};
