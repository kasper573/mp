import { useApi } from "@mp/api-service/sdk";
import type { AreaId } from "@mp/db/types";
import type {
  ActorSpritesheetLookup,
  AreaResource,
  GameAssetLoader,
} from "@mp/game/client";
import { loadActorSpritesheets, loadAreaResource } from "@mp/game/client";
import { useSuspenseQuery } from "@mp/query";
import type { TiledSpritesheetRecord } from "@mp/tiled-renderer";
import { loadTiledMapSpritesheets } from "@mp/tiled-renderer";

export const useGameAssets: GameAssetLoader = (areaId) => {
  const area = useAreaResource(areaId);
  return {
    area,
    areaSpritesheets: useAreaSpritesheets(area),
    actorSpritesheets: useActorSpritesheets(),
  };
};

export function useActorSpritesheets(): ActorSpritesheetLookup {
  const api = useApi();
  const { data: urls } = useSuspenseQuery(
    api.actorSpritesheetUrls.queryOptions("public"),
  );

  const query = useSuspenseQuery({
    queryKey: ["actorSpritesheets", urls],
    staleTime: Infinity,
    queryFn: () => loadActorSpritesheets(urls),
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
