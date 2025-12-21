import path from "path";
import { ApiContext, ctxFileResolver } from "../context";
import { FileUrlType } from "../integrations/file-resolver";
import { AreaId } from "@mp/game-shared";

/** @gqlQueryField */
export function areaFileUrl(
  areaId: AreaId,
  urlType: FileUrlType,
  { ioc }: ApiContext,
): string {
  return ioc.get(ctxFileResolver).abs(["areas", `${areaId}.json`], urlType);
}

export async function areaFileUrls(urlType: FileUrlType, { ioc }: ApiContext) {
  const fs = ioc.get(ctxFileResolver);
  const areaFiles = await fs.dir(["areas"]);
  return areaFiles.map((file) => {
    const areaId = path.basename(file, path.extname(file)) as AreaId;
    const url = fs.abs(["areas", file], urlType);
    return { areaId, url };
  });
}
