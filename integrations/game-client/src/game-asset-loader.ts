import type { AreaId } from "@mp/db/types";
import type {
  AreaResource,
  ItemDefinitionByReference,
  ItemReference,
} from "@mp/game-shared";
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
export type ItemDefinitionLookup = <Ref extends ItemReference>(
  ref: Ref,
) => ItemDefinitionByReference<Ref> | undefined;
