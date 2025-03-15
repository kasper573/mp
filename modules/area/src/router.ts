import type { AreaId, PublicUrl } from "../../data/src";
import { schemaFor, t } from "@mp-modules/trpc";
import { InjectionContext } from "@mp/ioc";

export type AreaRouter = typeof areaRouter;
export const areaRouter = t.router({
  areaFileUrl: t.procedure
    .input(schemaFor<AreaId>())
    .output(schemaFor<PublicUrl>())
    .query(({ input: areaId, ctx }) => {
      const resolveUrl = ctx.ioc.get(ctx_areaFileUrlResolver);
      return resolveUrl(areaId);
    }),
});

export const ctx_areaFileUrlResolver =
  InjectionContext.new<(areaId: AreaId) => PublicUrl>();
