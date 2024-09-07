import type {
  AreaId,
  PathToLocalFile,
  UrlFactory,
  UrlToPublicFile,
} from "@mp/state";
import { t } from "../factory";

export type AreaModule = ReturnType<typeof createAreaModule>;
export function createAreaModule(createUrl: UrlFactory) {
  return t.module({
    areaFileUrl: t.procedure
      .input<AreaId>()
      .output<UrlToPublicFile>()
      .type("client-to-server")
      .create(({ input: areaId }) =>
        createUrl(`areas/${areaId}.tmj` as PathToLocalFile),
      ),
  });
}
