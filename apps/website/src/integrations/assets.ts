import { graphql, useQueryBuilder } from "@mp/api-service/client";
import type { AreaId } from "@mp/game-shared";
import type { ActorTextureLookup, AreaAssetsLookup } from "@mp/game-client";
import {
  browserLoadAreaResource,
  loadActorTextureLookup,
  type GameAssetLoader,
} from "@mp/game-client";
import type {
  AreaResource,
  ItemDefinitionByReference,
  ItemDefinitionLookup,
  ItemReference,
} from "@mp/game-shared";
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
  const qb = useQueryBuilder();
  const { data } = useSuspenseQuery(
    qb.suspenseQueryOptions(actorTexturesQuery),
  );

  const { data: lookup } = useSuspenseQuery({
    queryKey: ["actor-spritesheet-lookup", data],
    staleTime: Infinity,
    queryFn: () =>
      loadActorTextureLookup(data.actorModelIds, data.actorSpritesheetUrl),
  });

  return lookup;
}

const actorTexturesQuery = graphql(`
  query ActorTextures {
    actorSpritesheetUrl(urlType: public)
    actorModelIds
  }
`);

export function useAreaResource(areaId: AreaId): AreaResource {
  const qb = useQueryBuilder();
  const {
    data: { areaFileUrl },
  } = useSuspenseQuery(qb.suspenseQueryOptions(actorResourceQuery, { areaId }));
  const query = useSuspenseQuery({
    queryKey: ["areaResource", areaFileUrl, areaId],
    staleTime: Infinity,
    queryFn: () => browserLoadAreaResource(areaId, areaFileUrl),
  });
  return query.data;
}

const actorResourceQuery = graphql(`
  query AreaResource($areaId: AreaId!) {
    areaFileUrl(areaId: $areaId, urlType: public)
  }
`);

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
  const qb = useQueryBuilder();
  const {
    data: { itemDefinition },
  } = useSuspenseQuery(
    qb.suspenseQueryOptions(itemDefinitionQuery, {
      // Note that it's important to destructure `ref`,
      // since it's generic and could contain excess properties that would pollute the query key.
      ref: {
        definitionId: ref.definitionId,
        type: ref.type,
      } as ItemReference,
    }),
  );

  // GraphQL does not support generics so we must assert to restore the generic type info.
  // it's safe to do, just ugly.
  return itemDefinition as ItemDefinitionByReference<Ref>;
};

const itemDefinitionQuery = graphql(`
  query ItemDefinition($ref: ItemReference!) {
    itemDefinition(ref: $ref)
  }
`);

export const gameAssetLoader: GameAssetLoader = {
  useAreaAssets,
  useItemDefinition,
  useActorTextures,
};
