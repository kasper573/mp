import { actorModelIds, areas, type AreaId } from "@mp/fixtures";
import type { ActorTextureLookup, AreaAssetsLookup } from "@mp/game-client";
import { loadActorTextureLookup, type GameAssetLoader } from "@mp/game-client";
import { loadAreaResource, type AreaResource } from "@mp/world";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { TiledSpritesheetRecord } from "@mp/tiled-renderer";
import { loadTiledMapSpritesheets } from "@mp/tiled-renderer";
import { env } from "../env";

export const useAreaAssets: AreaAssetsLookup = (areaId) => {
  const resource = useAreaResource(areaId);
  return {
    resource,
    spritesheets: useAreaSpritesheets(resource),
  };
};

export function useActorTextures(): ActorTextureLookup {
  const atlasUrl = `${env.fileServerUrl}/actors/actors-0.json`;

  const { data: lookup } = useSuspenseQuery({
    queryKey: ["actor-spritesheet-lookup", atlasUrl],
    staleTime: Infinity,
    queryFn: () => loadActorTextureLookup([...actorModelIds], atlasUrl),
  });

  return lookup;
}

export function useAreaResource(areaId: AreaId): AreaResource {
  const area = areas.find((a) => a.id === areaId);
  if (!area) {
    throw new Error(`Unknown area: ${areaId}`);
  }
  const areaFileUrl = `${env.fileServerUrl}/${area.tiledFile}`;
  const query = useSuspenseQuery({
    queryKey: ["areaResource", areaFileUrl, areaId],
    staleTime: Infinity,
    queryFn: () => loadAreaResource(areaId, areaFileUrl),
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

export const gameAssetLoader: GameAssetLoader = {
  useAreaAssets,
  useActorTextures,
};
