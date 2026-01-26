import { graphql } from "@mp/api-service/client";
import { useQueryBuilder } from "@mp/api-service/client/tanstack-query";
import type { AreaId } from "@mp/game-shared";
import type { ActorTexturesAccessor, AreaAssetsLookup } from "@mp/game-client";
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
import { loadTiledMapSpritesheets } from "@mp/tiled-renderer";

export const useAreaAssets: AreaAssetsLookup = (areaId) => {
  const resourceQuery = useAreaResourceQuery(areaId);
  const spritesheetsQuery = useAreaSpritesheetsQuery(() => resourceQuery.data);

  // Use getters to make the properties reactive - they'll be read lazily
  // and any reactive context will track the underlying query stores
  return {
    get resource() {
      // oxlint-disable-next-line typescript/no-non-null-assertion -- suspense will suspend until data is available
      return resourceQuery.data!;
    },
    get spritesheets() {
      // oxlint-disable-next-line typescript/no-non-null-assertion -- suspense will suspend until data is available
      return spritesheetsQuery.data!;
    },
  };
};

export function useActorTextures(): ActorTexturesAccessor {
  const qb = useQueryBuilder();
  const actorTexturesData = createQuery(() =>
    qb.queryOptions(actorTexturesQuery),
  );

  const lookup = createQuery(() => ({
    queryKey: ["actor-spritesheet-lookup", actorTexturesData.data],
    staleTime: Infinity,
    enabled: !!actorTexturesData.data,
    queryFn: () =>
      // oxlint-disable typescript/no-non-null-assertion -- enabled check above ensures data exists
      loadActorTextureLookup(
        actorTexturesData.data!.actorModelIds,
        actorTexturesData.data!.actorSpritesheetUrl,
      ),
    // oxlint-enable typescript/no-non-null-assertion
  }));

  // Return an object with a getter so that data access can be tracked
  // by SolidJS reactive contexts (createEffect, createMemo)
  return {
    get data() {
      // oxlint-disable-next-line typescript/no-non-null-assertion -- suspense will suspend until data is available
      return lookup.data!;
    },
  };
}

const actorTexturesQuery = graphql(`
  query ActorTextures {
    actorSpritesheetUrl(urlType: public)
    actorModelIds
  }
`);

function useAreaResourceQuery(areaId: AreaId) {
  const qb = useQueryBuilder();
  const areaFileData = createQuery(() =>
    qb.queryOptions(actorResourceQuery, { areaId }),
  );
  const query = createQuery(() => ({
    queryKey: ["areaResource", areaFileData.data?.areaFileUrl, areaId],
    staleTime: Infinity,
    enabled: !!areaFileData.data?.areaFileUrl,
    // oxlint-disable typescript/no-non-null-assertion -- enabled check above ensures data exists
    queryFn: () =>
      browserLoadAreaResource(areaId, areaFileData.data!.areaFileUrl),
    // oxlint-enable typescript/no-non-null-assertion
  }));
  return query;
}

const actorResourceQuery = graphql(`
  query AreaResource($areaId: AreaId!) {
    areaFileUrl(areaId: $areaId, urlType: public)
  }
`);

function useAreaSpritesheetsQuery(getArea: () => AreaResource | undefined) {
  const query = createQuery(() => {
    const area = getArea();
    return {
      queryKey: ["areaSpritesheets", area?.id],
      staleTime: Infinity,
      enabled: !!area,
      // oxlint-disable typescript/no-non-null-assertion -- enabled check above ensures area exists
      queryFn: () => loadTiledMapSpritesheets(area!.tiled.map),
      // oxlint-enable typescript/no-non-null-assertion
    };
  });
  return query;
}

export const useItemDefinition: ItemDefinitionLookup = <
  Ref extends ItemReference,
>(
  ref: Ref,
) => {
  const qb = useQueryBuilder();
  const query = createQuery(() =>
    qb.queryOptions(itemDefinitionQuery, {
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
