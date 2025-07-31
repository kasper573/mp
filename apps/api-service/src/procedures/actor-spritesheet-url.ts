import type { InjectionContainer } from "@mp/ioc";
import { ctxFileResolver } from "../context";
import { FileUrlType } from "../integrations/file-resolver";
import { rpc } from "../integrations/trpc";

export const actorSpritesheetUrl = rpc.procedure
  .input(FileUrlType)
  .query(({ ctx, input }) => getActorSpritesheetUrl(ctx.ioc, input));

export function getActorSpritesheetUrl(
  ioc: InjectionContainer,
  urlType: FileUrlType,
): string {
  const fs = ioc.get(ctxFileResolver);
  return fs.abs(["actors", `actors-0.json`], urlType);
}
