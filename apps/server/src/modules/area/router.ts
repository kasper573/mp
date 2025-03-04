import type { AreaId, PathToLocalFile, UrlToPublicFile } from "@mp/data";
import { schemaFor, t } from "@mp-modules/trpc";
import { serverFileToPublicUrl } from "../../etc/serverFileToPublicUrl";

export type AreaRouter = typeof areaRouter;
export const areaRouter = t.router({
  areaFileUrl: t.procedure
    .input(schemaFor<AreaId>())
    .output(schemaFor<UrlToPublicFile>())
    .query(({ input: areaId }) =>
      serverFileToPublicUrl(`areas/${areaId}.tmj` as PathToLocalFile),
    ),
});
