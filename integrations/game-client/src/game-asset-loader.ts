import type { AreaId } from "@mp/fixtures";
import type { AreaResource } from "@mp/world";
import type { TiledSpritesheetRecord } from "@mp/tiled-renderer";
import type { ActorTextureLookup } from "./actor-texture-lookup";

export interface AreaAssets {
  spritesheets: TiledSpritesheetRecord;
  resource: AreaResource;
}

export interface GameAssetLoader {
  useAreaAssets: AreaAssetsLookup;
  useActorTextures: () => ActorTextureLookup;
}

export type AreaAssetsLookup = (areaId: AreaId) => AreaAssets;
