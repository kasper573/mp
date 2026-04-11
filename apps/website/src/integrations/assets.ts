import { graphql, useQueryBuilder } from "@mp/api-service/client";
import { AreaResource, TiledResource, type AreaId } from "@mp/world";
import { createTiledLoader } from "@mp/tiled-loader";
import {
  loadTiledMapSpritesheets,
  type TiledSpritesheetRecord,
} from "@mp/tiled-renderer";
import { useSuspenseQuery } from "@tanstack/react-query";

export function useAreaResource(areaId: AreaId): AreaResource {
  const qb = useQueryBuilder();
  const {
    data: { areaFileUrl },
  } = useSuspenseQuery(qb.suspenseQueryOptions(areaResourceQuery, { areaId }));
  const query = useSuspenseQuery({
    queryKey: ["areaResource", areaFileUrl, areaId],
    staleTime: Infinity,
    queryFn: () => browserLoadAreaResource(areaId, areaFileUrl),
  });
  return query.data;
}

const areaResourceQuery = graphql(`
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

async function browserLoadAreaResource(
  areaId: AreaId,
  areaFileUrl: string,
): Promise<AreaResource> {
  const loadTiled = createTiledLoader({
    loadJson,
    relativePath: (path: string, base: string) => relativeUrl(path, base),
  });
  const result = await loadTiled(areaFileUrl);
  if (result.isErr()) {
    throw new Error(`Failed to load area "${areaId}" from "${areaFileUrl}"`, {
      cause: result.error,
    });
  }
  return new AreaResource(areaId, new TiledResource(result.value));
}

async function loadJson(url: string) {
  const response = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
  });
  const json: unknown = await response.json();
  return json as Record<string, unknown>;
}

function relativeUrl(path: string, base: string) {
  base = base.startsWith("//") ? window.location.protocol + base : base;
  const url = new URL(path, base);
  return url.toString();
}
