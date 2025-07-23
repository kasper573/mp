import type {
  ActorAnimationName,
  ActorModelId,
  ActorSpritesheetUrls,
  AreaId,
  Character,
} from "@mp/game/server";
import { roles, systemRoles, worldRoles } from "@mp/game/server";
import { InjectionContext } from "@mp/ioc";
import type { PublicUrl } from "@mp/std";
import { opt } from "./options";
import type { SimpleQueryQueryForItem, SearchResult } from "./pagination";
import { rpc } from "./rpc";
import { ctxResolver } from "./cdn";
import path from "path";

export type ApiRpcRouter = typeof rpcRouter;
export const rpcRouter = rpc.router({
  buildVersion: rpc.procedure.output<string>().query(() => opt.version),

  ping: rpc.procedure.output<void>().query(() => {}),

  testError: rpc.procedure
    .use(roles([systemRoles.useDevTools]))
    .output<string>()
    .query(() => {
      throw new Error("This is a test error that was thrown in the server");
    }),

  isPatchOptimizerEnabled: rpc.procedure
    .use(roles([systemRoles.changeSettings]))
    .output<boolean>()
    .query(() => {
      // TODO get config from database
      return true;
    }),

  setPatchOptimizerEnabled: rpc.procedure
    .use(roles([systemRoles.changeSettings]))
    .input<boolean>()
    .mutation(() => {
      // TODO update config in database
    }),

  characterList: rpc.procedure
    .use(roles([worldRoles.spectate]))
    .input<SimpleQueryQueryForItem<Character> | undefined>()
    .output<SearchResult<Character>>()
    .query(() => {
      // TODO query the database for online characters
      return {
        items: [],
        total: 0,
      };
    }),

  areaFileUrl: rpc.procedure
    .input<AreaId>()
    .output<PublicUrl>()
    .query(({ input: areaId, ctx }) =>
      ctx.get(ctxResolver).abs("areas", areaId),
    ),

  actorSpritesheetUrls: rpc.procedure
    .output<ActorSpritesheetUrls>()
    .query(async ({ ctx }) => {
      const cdn = ctx.get(ctxResolver);
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
    }),
});

export const ctxAreaFileUrlResolver = InjectionContext.new<
  (areaId: AreaId) => PublicUrl
>("AreaFileUrlResolver");
