import { schemaFor, t } from "@mp-modules/trpc/server";
import { InjectionContext } from "@mp/ioc";
import type { PublicUrl } from "@mp/std";
import type { AreaId } from "../../shared/area/area-id";

export type AreaRouter = typeof areaRouter;
export const areaRouter = t.router({
  areaFileUrl: t.procedure
    .input(schemaFor<AreaId>())
    .output(schemaFor<PublicUrl>())
    .query(({ input: areaId, ctx }) => {
      const resolveUrl = ctx.ioc.get(ctxAreaFileUrlResolver);
      return resolveUrl(areaId);
    }),
});

export const areaRouterSlice = { area: areaRouter };

export const ctxAreaFileUrlResolver =
  InjectionContext.new<(areaId: AreaId) => PublicUrl>();
