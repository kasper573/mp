import { useApi } from "@mp/api-service/sdk";
import type { Item } from "@mp/db";
import type { AreaId, ItemId } from "@mp/db/types";
import type {
  ActorTextureLookup,
  AreaAssetsLookup,
  ItemLookup,
} from "@mp/game-client";
import { loadActorTextureLookup, type GameAssetLoader } from "@mp/game-client";
import type { AreaResource } from "@mp/game-shared";
import { loadAreaResource } from "@mp/game-shared";
import { useQueries, useSuspenseQueries, useSuspenseQuery } from "@mp/query";
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

export const useItems: ItemLookup = (itemIds) => {
  const api = useApi();
  return useQueries({
    queries: new Set(itemIds)
      .values()
      .map((itemId) => api.item.queryOptions(itemId))
      .toArray(),
    combine: (result) => {
      const map = new Map<ItemId, Item>();
      for (const item of result) {
        if (item.data) {
          map.set(item.data.id, item.data);
        }
      }
      return map;
    },
  });
};

export const gameAssetLoader: GameAssetLoader = {
  useAreaAssets,
  useItems,
  useActorTextures,
};
