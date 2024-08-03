import type { AreaId, PathToLocalFile, UrlFactory } from "@mp/state";
import { t } from "../factory";

export function createAreaModule(createUrl: UrlFactory) {
  return t.module({
    areaFileUrl: t.event
      .payload<AreaId>()
      .type("client-to-server")
      .create(({ payload: areaId }) =>
        createUrl(`areas/${areaId}.tmx` as PathToLocalFile),
      ),
  });
}
