import type { AreaId } from "@mp/db/types";
import type { ActorSpritesheetLookup, AreaResource } from "@mp/game-shared";
import type { TiledSpritesheetRecord } from "@mp/tiled-renderer";

export interface GameAssets {
  areaSpritesheets: TiledSpritesheetRecord;
  actorSpritesheets: ActorSpritesheetLookup;
  area: AreaResource;
}

export type GameAssetLoader = (areaId: AreaId) => GameAssets;
