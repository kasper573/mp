import type { Item } from "@mp/db";
import type { AreaId, ItemId } from "@mp/db/types";
import type { AreaResource } from "@mp/game-shared";
import type { TiledSpritesheetRecord } from "@mp/tiled-renderer";
import type { ActorTextureLookup } from "./actor-texture-lookup";

export interface AreaAssets {
  areaSpritesheets: TiledSpritesheetRecord;
  area: AreaResource;
}

export interface GameAssetLoader {
  useAreaAssets: AreaAssetsLookup;
  useItems: ItemLookup;
  useActorTextures: () => ActorTextureLookup;
}

export type AreaAssetsLookup = (areaId: AreaId) => AreaAssets;
export type ItemLookup = (itemIds: ItemId[]) => ReadonlyMap<ItemId, Item>;
