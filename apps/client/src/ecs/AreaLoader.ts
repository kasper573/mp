import { TiledResource } from "@mp/excalibur";
import type { AreaId, PathToLocalFile } from "@mp/state";
import { AreaResource } from "@mp/state";
import { api } from "../api";

export class AreaLoader {
  private cache = new Map<AreaId, Promise<AreaResource>>();

  async require(id: AreaId): Promise<AreaResource> {
    let promise = this.cache.get(id);
    if (promise) {
      return promise;
    }

    const url = await api.modules.area.areaFileUrl(id);

    const areaFile = {
      url,
      filepath: "irrelevant-on-client" as PathToLocalFile,
    };
    const tiled = new TiledResource(areaFile.url);
    promise = tiled.load().then(() => new AreaResource(id, areaFile, tiled));
    this.cache.set(id, promise);
    return promise;
  }
}
