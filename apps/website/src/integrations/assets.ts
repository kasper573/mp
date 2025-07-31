import { useApi } from "@mp/api-service/sdk";
import type { AreaId } from "@mp/db/types";
import type { ActorTextureLookup } from "@mp/game-client";
import { loadActorTextureLookup, type GameAssetLoader } from "@mp/game-client";
import type { AreaResource } from "@mp/game-shared";
import { loadAreaResource } from "@mp/game-shared";
import { useSuspenseQueries, useSuspenseQuery } from "@mp/query";
import type { TiledSpritesheetRecord } from "@mp/tiled-renderer";
import { loadTiledMapSpritesheets } from "@mp/tiled-renderer";

export const useGameAssets: GameAssetLoader = (areaId) => {
  const area = useAreaResource(areaId);
  return {
    area,
    areaSpritesheets: useAreaSpritesheets(area),
    actorTextures: useActorTextureLookup(),
  };
};

export function useActorTextureLookup(): ActorTextureLookup {
  const api = useApi();
  const [{ data: url }, { data: modelIds }] = useSuspenseQueries({
    queries: [
      api.actorSpritesheetUrl.queryOptions("public"),
      api.actorModelIds.queryOptions(),
    ],
  });

  const query = useSuspenseQuery({
    queryKey: ["actor-spritesheet-lookup", url],
    staleTime: Infinity,
    queryFn: () => loadActorTextureLookup(modelIds, url),
  });

  return query.data;
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
