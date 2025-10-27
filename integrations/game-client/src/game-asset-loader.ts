import type { AreaId } from "@mp/game-shared";
import type { AreaResource, ItemDefinitionLookup } from "@mp/game-shared";
import type { TiledSpritesheetRecord } from "@mp/tiled-renderer";
import type { ActorTextureLookup } from "./actor-texture-lookup";

export interface AreaAssets {
  spritesheets: TiledSpritesheetRecord;
  resource: AreaResource;
}

export interface GameAssetLoader {
  useAreaAssets: AreaAssetsLookup;
  useItemDefinition: ItemDefinitionLookup;
  useActorTextures: () => ActorTextureLookup;
}

export type AreaAssetsLookup = (areaId: AreaId) => AreaAssets;
