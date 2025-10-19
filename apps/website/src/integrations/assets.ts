import { useApi } from "@mp/api-service/sdk";
import type { AreaId } from "@mp/db/types";
import type { ActorTextureLookup, AreaAssetsLookup } from "@mp/game-client";
import { loadActorTextureLookup, type GameAssetLoader } from "@mp/game-client";
import type {
  AreaResource,
  ItemDefinitionByReference,
  ItemDefinitionLookup,
  ItemReference,
} from "@mp/game-shared";
import { loadAreaResource } from "@mp/game-shared";
import { useSuspenseQueries, useSuspenseQuery } from "@mp/query";
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

export const useItemDefinition: ItemDefinitionLookup = <
  Ref extends ItemReference,
>(
  ref: Ref,
) => {
  const api = useApi();
  const { data } = useSuspenseQuery(
    // Note that it's important to destructure `ref`,
    // since it's generic and could contain excess properties that would pollute the query key.
    api.itemDefinition.queryOptions({
      type: ref.type,
      definitionId: ref.definitionId,
    }),
  );

  // TRPC does not support generic type parameters in procedures,
  // so i have to assert to restore the generic type information here.
  // it's safe to do, just ugly.
  return data as ItemDefinitionByReference<Ref>;
};

export const gameAssetLoader: GameAssetLoader = {
  useAreaAssets,
  useItemDefinition,
  useActorTextures,
};
