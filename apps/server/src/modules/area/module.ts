import type {
  AreaId,
  PathToLocalFile,
  UrlFactory,
  UrlToPublicFile,
} from "@mp/state";
import { t } from "../factory";

export function createAreaModule(createUrl: UrlFactory) {
  return t.module({
    areaFileUrl: t.procedure
      .input<AreaId>()
      .output<UrlToPublicFile>()
      .type("client-to-server")
      .create(({ input: areaId }) =>
        createUrl(`areas/${areaId}.tmx` as PathToLocalFile),
      ),
  });
}
