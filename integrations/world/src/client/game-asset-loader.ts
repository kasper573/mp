import type { AreaId } from "../identity/ids";
import type { AreaResource } from "../area/area-resource";
import type { ItemDefinitionLookup } from "../item/definition-lookup";
import type { TiledSpritesheetRecord } from "@mp/tiled-renderer";
import type { ActorTextureLookup } from "../appearance/actor-texture-lookup";

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
