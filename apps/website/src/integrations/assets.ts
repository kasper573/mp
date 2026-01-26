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
import { createQuery } from "@tanstack/solid-query";
import type { TiledSpritesheetRecord } from "@mp/tiled-renderer";
import { loadTiledMapSpritesheets } from "@mp/tiled-renderer";

export const useAreaAssets: AreaAssetsLookup = (areaId) => {
  const resource = useAreaResource(areaId);
  return {
    resource,
    spritesheets: useAreaSpritesheets(resource),
  };
};

// Helper to assert data is defined (guaranteed within Suspense boundary)
function defined<T>(value: T | undefined): T {
  return value as T;
}

export function useActorTextures(): ActorTextureLookup {
  const qb = useQueryBuilder();
  const query = createQuery(() =>
    qb.suspenseQueryOptions(actorTexturesQuery),
  );

  const lookupQuery = createQuery(() => ({
    queryKey: ["actor-spritesheet-lookup", query.data],
    staleTime: Infinity,
    queryFn: () =>
      loadActorTextureLookup(
        defined(query.data).actorModelIds,
        defined(query.data).actorSpritesheetUrl,
      ),
  }));

  return defined(lookupQuery.data);
}

const actorTexturesQuery = graphql(`
  query ActorTextures {
    actorSpritesheetUrl(urlType: public)
    actorModelIds
  }
`);

export function useAreaResource(areaId: AreaId): AreaResource {
  const qb = useQueryBuilder();
  const urlQuery = createQuery(() =>
    qb.suspenseQueryOptions(actorResourceQuery, { areaId }),
  );
  const resourceQuery = createQuery(() => ({
    queryKey: ["areaResource", defined(urlQuery.data).areaFileUrl, areaId],
    staleTime: Infinity,
    queryFn: () =>
      browserLoadAreaResource(areaId, defined(urlQuery.data).areaFileUrl),
  }));
  return defined(resourceQuery.data);
}

const actorResourceQuery = graphql(`
  query AreaResource($areaId: AreaId!) {
    areaFileUrl(areaId: $areaId, urlType: public)
  }
`);

export function useAreaSpritesheets(
  area: AreaResource,
): TiledSpritesheetRecord {
  const query = createQuery(() => ({
    queryKey: ["areaSpritesheets", area.id],
    staleTime: Infinity,
    queryFn: () => loadTiledMapSpritesheets(area.tiled.map),
  }));
  return defined(query.data);
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
  return defined(query.data).itemDefinition as ItemDefinitionByReference<Ref>;
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
