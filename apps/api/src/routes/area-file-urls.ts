import type { AreaId } from "@mp/game/server";
import type { PublicUrl } from "@mp/std";
import path from "path";
import { ctxFileResolver } from "../integrations/file-server";
import { rpc } from "../integrations/trpc";
import { type } from "@mp/validate";
import type { InjectionContainer } from "@mp/ioc";

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
): Promise<ReadonlyMap<AreaId, PublicUrl>> {
  const fs = ioc.get(ctxFileResolver);
  const areaFiles = await fs.dir("areas");
  return new Map(
    areaFiles.map((file): [AreaId, PublicUrl] => {
      const id = path.basename(file, path.extname(file)) as AreaId;
      const url = fs.abs("areas", file);
      return [id, url];
    }),
  );
}
