import type {
  AreaId,
  PathToLocalFile,
  UrlFactory,
  UrlToPublicFile,
} from "@mp/data";
import { schemaFor, t } from "../../trpc.ts";

export type AreaRouter = ReturnType<typeof createAreaRouter>;
export function createAreaRouter(createUrl: UrlFactory) {
  return t.router({
    areaFileUrl: t.procedure
      .input(schemaFor<AreaId>())
      .output(schemaFor<UrlToPublicFile>())
      .query(({ input: areaId }) =>
        createUrl(`areas/${areaId}.tmj` as PathToLocalFile)
      ),
  });
}
