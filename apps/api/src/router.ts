import type {
  ActorAnimationName,
  ActorModelId,
  ActorSpritesheetUrls,
  AreaId,
  Character,
} from "@mp/game/server";
import { systemRoles, worldRoles } from "@mp/game/server";
import { InjectionContext } from "@mp/ioc";
import type { PublicUrl } from "@mp/std";
import { opt } from "./options";
import { rpc } from "./rpc";
import { ctxResolver } from "./cdn";
import path from "path";
import { type } from "@mp/validate";
import { roles } from "./middlewares/auth";

export type ApiRpcRouter = typeof apiRouter;
export const apiRouter = rpc.router({
  buildVersion: rpc.procedure.query(() => opt.version),

  ping: rpc.procedure.query(() => {}),

  testError: rpc.procedure.use(roles([systemRoles.useDevTools])).query(() => {
    throw new Error("This is a test error that was thrown in the server");
  }),

  isPatchOptimizerEnabled: rpc.procedure
    .use(roles([systemRoles.changeSettings]))
    .output(type("boolean"))
    .query(() => {
      // TODO get config from database
      return true;
    }),

  setPatchOptimizerEnabled: rpc.procedure
    .use(roles([systemRoles.changeSettings]))
    .input(type("boolean"))
    .mutation(() => {
      // TODO update config in database
    }),

  characterList: rpc.procedure.use(roles([worldRoles.spectate])).query(() => {
    // TODO query the database for online characters
    return {
      items: [] as Character[],
      total: 0,
    };
  }),

  areaFileUrl: rpc.procedure
    .input(type("string").brand("AreaId"))
    .query(({ input: areaId, ctx }) =>
      ctx.ioc.get(ctxResolver).abs("areas", areaId),
    ),

  actorSpritesheetUrls: rpc.procedure.query(
    async ({ ctx }): Promise<ActorSpritesheetUrls> => {
      const cdn = ctx.ioc.get(ctxResolver);
      const modelFolders = await cdn.dir<ActorModelId>("actors");
      return new Map(
        await Promise.all(
          modelFolders.map(async (modelId) => {
            const spritesheetFiles = await cdn.dir("actors", modelId);
            const spritesheets: ReadonlyMap<ActorAnimationName, PublicUrl> =
              new Map(
                await Promise.all(
                  spritesheetFiles.map(
                    (spritesheet): [ActorAnimationName, PublicUrl] => {
                      const state = path.basename(
                        spritesheet,
                        path.extname(spritesheet),
                      ) as ActorAnimationName;
                      const url = cdn.abs("actors", modelId, spritesheet);
                      return [state, url];
                    },
                  ),
                ),
              );
            return [modelId, spritesheets] as const;
          }),
        ),
      );
    },
  ),
});

export const ctxAreaFileUrlResolver = InjectionContext.new<
  (areaId: AreaId) => PublicUrl
>("AreaFileUrlResolver");
