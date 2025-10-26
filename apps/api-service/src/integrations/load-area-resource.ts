import type { AreaId } from "@mp/db/types";
import { AreaResource, TiledResource } from "@mp/game-shared";
import { createTiledLoader } from "@mp/tiled-loader";

export async function loadAreaResource(
  areaId: AreaId,
  areaFileUrl: string,
): Promise<AreaResource> {
  const loadTiled = createTiledLoader({
    loadJson,
    relativePath: (path, base) => relativeUrl(path, base),
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
  base = base.startsWith("//") ? "https:" + base : base;
  const url = new URL(path, base);
  return url.toString();
}
