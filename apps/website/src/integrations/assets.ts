import * as fixtures from "@mp/fixtures";
import type {
  ActorTextureLookup,
  AreaAssetsLookup,
  GameAssetLoader,
  ItemDefinition,
  ItemDefinitionLookup,
  ItemReference,
} from "@mp/world";
import { browserLoadAreaResource, loadActorTextureLookup } from "@mp/world";
import { useSuspenseQuery } from "@tanstack/react-query";
import { loadTiledMapSpritesheets } from "@mp/tiled-renderer";
import { env } from "../env";

export const useAreaAssets: AreaAssetsLookup = (areaId) => {
  const { data: resource } = useSuspenseQuery({
    queryKey: ["areaResource", areaId],
    staleTime: Infinity,
    queryFn: () =>
      browserLoadAreaResource(
        areaId,
        `${env.fileServerBaseUrl}/areas/${areaId}.json`,
      ),
  });
  const { data: spritesheets } = useSuspenseQuery({
    queryKey: ["areaSpritesheets", resource.id],
    staleTime: Infinity,
    queryFn: () => loadTiledMapSpritesheets(resource.tiled.map),
  });
  return { resource, spritesheets };
};

export function useActorTextures(): ActorTextureLookup {
  const modelIds = fixtures.actorModels.map((m) => m.id);
  const { data: lookup } = useSuspenseQuery({
    queryKey: ["actor-spritesheet-lookup", modelIds.join(",")],
    staleTime: Infinity,
    queryFn: () =>
      loadActorTextureLookup(
        modelIds,
        `${env.fileServerBaseUrl}/actors/actors-0.json`,
      ),
  });
  return lookup;
}

export const useItemDefinition: ItemDefinitionLookup = <
  Ref extends ItemReference,
>(
  ref: Ref,
): Extract<ItemDefinition, { type: Ref["type"] }> => fixtures.lookupItem(ref);

export const gameAssetLoader: GameAssetLoader = {
  useAreaAssets,
  useItemDefinition,
  useActorTextures,
};
