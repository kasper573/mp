import type { AreaId } from "@mp/db/types";
import type { AreaResource } from "@mp/game-shared";
import type { TiledSpritesheetRecord } from "@mp/tiled-renderer";
import type { ActorTextureLookup } from "./actor-texture-lookup";

export interface GameAssets {
  areaSpritesheets: TiledSpritesheetRecord;
  actorTextures: ActorTextureLookup;
  area: AreaResource;
}

export type GameAssetLoader = (areaId: AreaId) => GameAssets;
