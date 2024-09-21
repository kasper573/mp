import type { AreaId, PathToLocalFile } from "@mp/data";
import { AreaResource, TiledResource } from "@mp/data";
import { createTiledLoader } from "@mp/tiled-loader";
import { api } from "../api";

export class AreaLoader {
  private cache = new Map<AreaId, Promise<AreaResource>>();

  private loadTiled = createTiledLoader({
    loadJson,
    relativePath: relativeURL,
  });

  async require(id: AreaId): Promise<AreaResource> {
    let promise = this.cache.get(id);
    if (promise) {
      return promise;
    }

    const areaFile = {
      url: await api.modules.area.areaFileUrl(id),
      filepath: "irrelevant-on-client" as PathToLocalFile,
    };

    const tiledPromise = this.loadTiled(areaFile.url);
    promise = tiledPromise.then(({ tiledMap, error }) => {
      if (error || !tiledMap) {
        throw new Error(String(error || "Failed to load area"));
      }
      return new AreaResource(id, new TiledResource(tiledMap));
    });
    this.cache.set(id, promise);
    return promise;
  }

  dispose() {
    this.cache.clear();
  }
}

async function loadJson(url: string) {
  const response = await fetch(url);
  const json: unknown = await response.json();
  return json as Record<string, unknown>;
}

function relativeURL(url: string, base: string) {
  base = base.startsWith("//") ? window.location.protocol + base : base;
  return new URL(url, base).toString();
}
