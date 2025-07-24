import type { AreaLookup, AreaId } from "@mp/game/server";
import { AreaResource, TiledResource } from "@mp/game/server";
import type { PublicUrl } from "@mp/std";
import { createTiledLoader } from "@mp/tiled-loader";

export async function loadAreas(
  areaUrls: ReadonlyMap<AreaId, PublicUrl>,
): Promise<AreaLookup> {
  return new Map(
    await Promise.all(
      areaUrls.entries().map(async ([areaId, areaUrl]) => {
        return [
          areaId,
          new AreaResource(areaId, await loadTiled(areaUrl)),
        ] as const;
      }),
    ),
  );
}

async function loadTiled(tmjFile: string) {
  const result = await loadTiledViaUrl(tmjFile);
  if (result.isErr()) {
    throw result.error;
  }
  return new TiledResource(result.value);
}

const loadTiledViaUrl = createTiledLoader({
  loadJson,
  relativePath: relativeUrl,
});

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
