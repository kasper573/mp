import type { AreaId } from "@mp/db/types";
import type { AreaResource } from "@mp/game-shared";
import type { TiledSpritesheetRecord } from "@mp/tiled-renderer";
import type { ActorSpritesheetLookup } from "./actor-spritesheet-lookup";

export interface GameAssets {
  areaSpritesheets: TiledSpritesheetRecord;
  actorSpritesheets: ActorSpritesheetLookup;
  area: AreaResource;
}

export type GameAssetLoader = (areaId: AreaId) => GameAssets;
