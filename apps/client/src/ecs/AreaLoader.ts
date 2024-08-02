import { TiledResource } from "@mp/excalibur";
import type { AreaId, PathToLocalFile, UrlToPublicFile } from "@mp/state";
import { AreaResource } from "@mp/state";

export class AreaLoader {
  private cache = new Map<AreaId, Promise<AreaResource>>();

  async require(id: AreaId): Promise<AreaResource> {
    let promise = this.cache.get(id);
    if (promise) {
      return promise;
    }

    const areaFile = {
      url: `http://localhost:2567/public/areas/${id}.tmx` as UrlToPublicFile,
      filepath: "irrelevant-on-client" as PathToLocalFile,
    };
    const tiled = new TiledResource(areaFile.url);
    promise = tiled.load().then(() => new AreaResource(id, areaFile, tiled));
    this.cache.set(id, promise);
    return promise;
  }
}
