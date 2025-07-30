import type { AreaId } from "@mp/game/server";
import type { UrlString } from "@mp/std";
import path from "path";
import { rpc } from "../integrations/trpc";
import { type } from "@mp/validate";
import type { InjectionContainer } from "@mp/ioc";
import { ctxFileResolver } from "../ioc";
import { FileUrlType } from "../integrations/file-resolver";

export const areaFileUrl = rpc.procedure
  .input(
    type({
      areaId: type("string").brand("AreaId"),
      urlType: FileUrlType,
    }),
  )
  .query(({ input: { areaId, urlType }, ctx }) =>
    ctx.ioc.get(ctxFileResolver).abs(["areas", `${areaId}.json`], urlType),
  );

export const areaFileUrls = rpc.procedure
  .input(FileUrlType)
  .query(({ ctx, input }) => getAreaFileUrls(ctx.ioc, input));

export async function getAreaFileUrls(
  ioc: InjectionContainer,
  urlType: FileUrlType,
): Promise<ReadonlyMap<AreaId, UrlString>> {
  const fs = ioc.get(ctxFileResolver);
  const areaFiles = await fs.dir(["areas"]);
  return new Map(
    areaFiles.map((file): [AreaId, UrlString] => {
      const id = path.basename(file, path.extname(file)) as AreaId;
      const url = fs.abs(["areas", file], urlType);
      return [id, url];
    }),
  );
}
