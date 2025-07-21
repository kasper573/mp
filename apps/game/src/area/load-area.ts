import { createTiledLoader } from "@mp/tiled-loader";
import type { AreaId } from "./area-id";
import { TiledResource } from "./tiled-resource";
import { AreaResource } from "./area-resource";

export async function loadAreaResource(
  areaFileUrl: string,
  areaId: AreaId,
): Promise<AreaResource> {
  const loadTiled = createTiledLoader({
    loadJson,
    relativePath: (path, base) => relativeUrl(path, base),
  });
  const result = await loadTiled(areaFileUrl);
  if (result.isErr()) {
    throw result.error;
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
