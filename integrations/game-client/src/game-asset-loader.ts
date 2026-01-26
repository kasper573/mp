import type { AreaId } from "@mp/game-shared";
import type { AreaResource, ItemDefinitionLookup } from "@mp/game-shared";
import type { TiledSpritesheetRecord } from "@mp/tiled-renderer";
import type { ActorTextureLookup } from "./actor-texture-lookup";

export interface AreaAssets {
  spritesheets: TiledSpritesheetRecord;
  resource: AreaResource;
}

/**
 * Provides reactive access to actor textures.
 * Access the `data` getter inside a reactive context (createEffect, createMemo)
 * for proper change tracking.
 */
export interface ActorTexturesAccessor {
  readonly data: ActorTextureLookup;
}

export interface GameAssetLoader {
  useAreaAssets: AreaAssetsLookup;
  useItemDefinition: ItemDefinitionLookup;
  useActorTextures: () => ActorTexturesAccessor;
}

export type AreaAssetsLookup = (areaId: AreaId) => AreaAssets;
