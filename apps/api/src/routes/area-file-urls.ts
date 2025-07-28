import type { AreaId } from "@mp/game/server";
import type { UrlString } from "@mp/std";
import path from "path";
import { rpc } from "../integrations/trpc";
import { type } from "@mp/validate";
import type { InjectionContainer } from "@mp/ioc";
import { ctxFileResolver } from "../ioc";

export const areaFileUrl = rpc.procedure
  .input(type("string").brand("AreaId"))
  .query(({ input: areaId, ctx }) =>
    ctx.ioc.get(ctxFileResolver).abs("areas", `${areaId}.json`),
  );

export const areaFileUrls = rpc.procedure.query(({ ctx }) =>
  getAreaFileUrls(ctx.ioc),
);

export async function getAreaFileUrls(
  ioc: InjectionContainer,
): Promise<ReadonlyMap<AreaId, UrlString>> {
  const fs = ioc.get(ctxFileResolver);
  const areaFiles = await fs.dir("areas");
  return new Map(
    areaFiles.map((file): [AreaId, UrlString] => {
      const id = path.basename(file, path.extname(file)) as AreaId;
      const url = fs.abs("areas", file);
      return [id, url];
    }),
  );
}
