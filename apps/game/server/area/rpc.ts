import { InjectionContext } from "@mp/ioc";
import type { PublicUrl } from "@mp/std";
import type { AreaId } from "../../shared/area/area-id";
import { rpc } from "../rpc";
import type { ActorModelId, ActorModelState } from "../traits/appearance";

export type AssetsRouter = typeof assetsRouter;
export const assetsRouter = rpc.router({
  areaFileUrl: rpc.procedure
    .input<AreaId>()
    .output<PublicUrl>()
    .query(({ input: areaId, ctx }) => {
      const resolveUrl = ctx.get(ctxAreaFileUrlResolver);
      return resolveUrl(areaId);
    }),
  actorSpritesheetUrls: rpc.procedure
    .output<ActorSpritesheetUrls>()
    .query(({ ctx }) => ctx.get(ctxActorSpritesheetUrls)),
});

export const assetsRouterSlice = { area: assetsRouter };

export const ctxAreaFileUrlResolver = InjectionContext.new<
  (areaId: AreaId) => PublicUrl
>("AreaFileUrlResolver");

export const ctxActorSpritesheetUrls =
  InjectionContext.new<ActorSpritesheetUrls>("ActorSpritesheetUrls");

export type ActorSpritesheetUrls = ReadonlyMap<
  ActorModelId,
  ReadonlyMap<ActorModelState, PublicUrl>
>;
