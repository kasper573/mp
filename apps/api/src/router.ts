import type {
  ActorAnimationName,
  ActorModelId,
  ActorSpritesheetUrls,
  AreaId,
  Character,
} from "@mp/game/server";
import { systemRoles, worldRoles } from "@mp/game/server";

import type { PublicUrl } from "@mp/std";
import { opt } from "./options";
import { rpc } from "./integrations/trpc";
import { ctxFileResolver } from "./integrations/file-server";
import path from "path";
import { type } from "@mp/validate";
import { roles } from "./integrations/auth";

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
      ctx.ioc.get(ctxFileResolver).abs("areas", areaId),
    ),

  areaFileUrls: rpc.procedure.query(
    async ({ ctx }): Promise<ReadonlyMap<AreaId, PublicUrl>> => {
      const fs = ctx.ioc.get(ctxFileResolver);
      const areaFiles = await fs.dir("areas");
      return new Map(
        areaFiles.map((file): [AreaId, PublicUrl] => {
          const id = path.basename(file, path.extname(file)) as AreaId;
          const url = fs.abs("areas", file);
          return [id, url];
        }),
      );
    },
  ),

  actorSpritesheetUrls: rpc.procedure.query(
    async ({ ctx }): Promise<ActorSpritesheetUrls> => {
      const fs = ctx.ioc.get(ctxFileResolver);
      const modelFolders = await fs.dir<ActorModelId>("actors");
      return new Map(
        await Promise.all(
          modelFolders.map(async (modelId) => {
            const spritesheetFiles = await fs.dir("actors", modelId);
            const spritesheets: ReadonlyMap<ActorAnimationName, PublicUrl> =
              new Map(
                await Promise.all(
                  spritesheetFiles.map(
                    (spritesheet): [ActorAnimationName, PublicUrl] => {
                      const state = path.basename(
                        spritesheet,
                        path.extname(spritesheet),
                      ) as ActorAnimationName;
                      const url = fs.abs("actors", modelId, spritesheet);
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
