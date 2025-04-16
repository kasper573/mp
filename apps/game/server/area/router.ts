import { InjectionContext } from "@mp/ioc";
import type { PublicUrl } from "@mp/std";
import type { AreaId } from "../../shared/area/area-id";
import { rpc } from "../rpc";

export type AreaRouter = typeof areaRouter;
export const areaRouter = rpc.router({
  areaFileUrl: rpc.procedure
    .input<AreaId>()
    .output<PublicUrl>()
    .query(({ input: areaId, ctx }) => {
      const resolveUrl = ctx.get(ctxAreaFileUrlResolver);
      return resolveUrl(areaId);
    }),
});

export const areaRouterSlice = { area: areaRouter };

export const ctxAreaFileUrlResolver =
  InjectionContext.new<(areaId: AreaId) => PublicUrl>();
