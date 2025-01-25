import type { AreaId } from "@mp/data";
import { AreaResource, TiledResource } from "@mp/data";
import { createTiledLoader } from "@mp/tiled-loader";
import { trpc } from "../integrations/trpc";

export async function loadAreaResource(areaId: AreaId) {
  const url = await trpc.area.areaFileUrl.query(areaId);
  const result = await loadTiled(url);
  return new AreaResource(areaId, new TiledResource(result._unsafeUnwrap()));
}

const loadTiled = createTiledLoader({
  loadJson,
  relativePath: relativeURL,
});

async function loadJson(url: string) {
  const response = await fetch(url);
  const json: unknown = await response.json();
  return json as Record<string, unknown>;
}

function relativeURL(url: string, base: string) {
  base = base.startsWith("//") ? window.location.protocol + base : base;
  return new URL(url, base).toString();
}
