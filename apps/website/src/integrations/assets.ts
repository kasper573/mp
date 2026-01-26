// oxlint-disable no-non-null-assertion -- Suspense boundaries guarantee data availability
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
import { createQuery, skipToken } from "@tanstack/solid-query";
import type { TiledSpritesheetRecord } from "@mp/tiled-renderer";
import { loadTiledMapSpritesheets } from "@mp/tiled-renderer";

export const useAreaAssets: AreaAssetsLookup = (areaId) => {
  const resource = useAreaResource(areaId);
  const spritesheets = useAreaSpritesheets(resource);
  return {
    resource: resource!,
    spritesheets: spritesheets!,
  };
};

export function useActorTextures(): ActorTextureLookup | undefined {
  const qb = useQueryBuilder();
  const query = createQuery(() => qb.suspenseQueryOptions(actorTexturesQuery));

  const lookupQuery = createQuery(() =>
    query.data
      ? {
          queryKey: ["actor-spritesheet-lookup", query.data],
          staleTime: Infinity,
          queryFn: () =>
            loadActorTextureLookup(
              query.data!.actorModelIds,
              query.data!.actorSpritesheetUrl,
            ),
        }
      : {
          queryKey: ["actor-spritesheet-lookup", "pending"],
          queryFn: skipToken,
        },
  );

  return lookupQuery.data;
}

const actorTexturesQuery = graphql(`
  query ActorTextures {
    actorSpritesheetUrl(urlType: public)
    actorModelIds
  }
`);

export function useAreaResource(areaId: AreaId): AreaResource | undefined {
  const qb = useQueryBuilder();
  const urlQuery = createQuery(() =>
    qb.suspenseQueryOptions(actorResourceQuery, { areaId }),
  );
  const query = createQuery(() =>
    urlQuery.data
      ? {
          queryKey: ["areaResource", urlQuery.data.areaFileUrl, areaId],
          staleTime: Infinity,
          queryFn: () =>
            browserLoadAreaResource(areaId, urlQuery.data!.areaFileUrl),
        }
      : {
          queryKey: ["areaResource", "pending", areaId],
          queryFn: skipToken,
        },
  );
  return query.data;
}

const actorResourceQuery = graphql(`
  query AreaResource($areaId: AreaId!) {
    areaFileUrl(areaId: $areaId, urlType: public)
  }
`);

export function useAreaSpritesheets(
  area: AreaResource | undefined,
): TiledSpritesheetRecord | undefined {
  const query = createQuery(() =>
    area
      ? {
          queryKey: ["areaSpritesheets", area.id],
          staleTime: Infinity,
          queryFn: () => loadTiledMapSpritesheets(area.tiled.map),
        }
      : {
          queryKey: ["areaSpritesheets", "pending"],
          queryFn: skipToken,
        },
  );
  return query.data;
}

export const useItemDefinition: ItemDefinitionLookup = <
  Ref extends ItemReference,
>(
  ref: Ref,
) => {
  const qb = useQueryBuilder();
  const query = createQuery(() =>
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
  return (query.data?.itemDefinition ?? {}) as ItemDefinitionByReference<Ref>;
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
