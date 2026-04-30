import { createTiledLoader } from "@mp/tiled-loader";
import type { AreaId } from "../identity/ids";
import { AreaResource } from "./area-resource";
import { TiledResource } from "./tiled-resource";

export interface LoadAreaResourceOptions {
  readonly fetchJson?: (url: string) => Promise<unknown>;
  readonly resolveRelative?: (path: string, base: string) => string;
}

export async function loadAreaResource(
  areaId: AreaId,
  areaFileUrl: string,
  opts: LoadAreaResourceOptions = {},
): Promise<AreaResource> {
  const fetchJson = opts.fetchJson;
  const loadTiled = createTiledLoader({
    loadJson: fetchJson
      ? async (url) => (await fetchJson(url)) as Record<string, unknown>
      : defaultLoadJson,
    relativePath: opts.resolveRelative ?? defaultRelative,
  });
  const result = await loadTiled(areaFileUrl);
  if (result.isErr()) {
    throw new Error(`Failed to load area "${areaId}" from "${areaFileUrl}"`, {
      cause: result.error,
    });
  }
  return new AreaResource(areaId, new TiledResource(result.value));
}

async function defaultLoadJson(url: string): Promise<Record<string, unknown>> {
  const response = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
  });
  const json: unknown = await response.json();
  return json as Record<string, unknown>;
}

function defaultRelative(path: string, base: string): string {
  const normalized = base.startsWith("//") ? "https:" + base : base;
  const url = new URL(path, normalized);
  return url.toString();
}
