import type { AreaId } from "@mp/game-shared";
import type { AreaResource, ItemDefinitionLookup } from "@mp/game-shared";
import type { TiledSpritesheetRecord } from "@mp/tiled-renderer";
import type { ActorTextureLookup } from "./actor-texture-lookup";

export interface AreaAssets {
  spritesheets: TiledSpritesheetRecord | undefined;
  resource: AreaResource | undefined;
}

export interface GameAssetLoader {
  useAreaAssets: AreaAssetsLookup;
  useItemDefinition: ItemDefinitionLookup;
  useActorTextures: () => ActorTextureLookup | undefined;
}

export type AreaAssetsLookup = (areaId: AreaId) => AreaAssets | undefined;
