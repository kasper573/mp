import { useApi } from "@mp/api-service/sdk";
import type { AreaId } from "@mp/db/types";
import type { ActorTextureLookup, AreaAssetsLookup } from "@mp/game-client";
import { loadActorTextureLookup, type GameAssetLoader } from "@mp/game-client";
import type {
  AreaResource,
  ItemDefinitionByReference,
  ItemReference,
} from "@mp/game-shared";
import { loadAreaResource } from "@mp/game-shared";
import { useQuery, useSuspenseQueries, useSuspenseQuery } from "@mp/query";
import type { TiledSpritesheetRecord } from "@mp/tiled-renderer";
import { loadTiledMapSpritesheets } from "@mp/tiled-renderer";

export const useAreaAssets: AreaAssetsLookup = (areaId) => {
  const resource = useAreaResource(areaId);
  return {
    resource,
    spritesheets: useAreaSpritesheets(resource),
  };
};

export function useActorTextures(): ActorTextureLookup {
  const api = useApi();
  const [{ data: url }, { data: modelIds }] = useSuspenseQueries({
    queries: [
      api.actorSpritesheetUrl.queryOptions("public"),
      api.actorModelIds.queryOptions(),
    ],
  });

  const { data: lookup } = useSuspenseQuery({
    queryKey: ["actor-spritesheet-lookup", url],
    staleTime: Infinity,
    queryFn: () => loadActorTextureLookup(modelIds, url),
  });

  return lookup;
}

export function useAreaResource(areaId: AreaId): AreaResource {
  const api = useApi();
  const { data: url } = useSuspenseQuery(
    api.areaFileUrl.queryOptions({ areaId, urlType: "public" }),
  );
  const query = useSuspenseQuery({
    queryKey: ["areaResource", url, areaId],
    staleTime: Infinity,
    queryFn: () => loadAreaResource(areaId, url),
  });
  return query.data;
}

export function useAreaSpritesheets(
  area: AreaResource,
): TiledSpritesheetRecord {
  const query = useSuspenseQuery({
    queryKey: ["areaSpritesheets", area.id],
    staleTime: Infinity,
    queryFn: () => loadTiledMapSpritesheets(area.tiled.map),
  });
  return query.data;
}

/**
 * TODO change this to a batched hook instead. it's more efficient to just send something like this:
 * {
 *   consumable: [id1, id2, id3],
 *   equipment: [id4, id5, id6]
 * }
 *
 * it also allows us to use useSuspenseQuery, which seems to work better when queried higher up in the tree on batched input.
 */
export function useItemDefinition<Ref extends ItemReference>(
  ref: Ref,
): ItemDefinitionByReference<Ref> | undefined {
  const api = useApi();
  // Note: useSuspenseQuery seems to make preact just crash for some reason.
  const { data } = useQuery(api.itemDefinition.queryOptions(ref));

  // would prefer to use useSuspenseQuery, but can't.
  if (!data) {
    return;
  }

  // TRPC does not support generic type parameters in procedures,
  // so i have to assert to restore the generic type information here.
  // it's safe to do, just ugly.
  return data as ItemDefinitionByReference<Ref>;
}

export const gameAssetLoader: GameAssetLoader = {
  useAreaAssets,
  useItemDefinition,
  useActorTextures,
};
