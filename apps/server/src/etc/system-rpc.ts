import type { ActorSpritesheetUrls, AreaId, Character } from "@mp/game/server";
import {
  ctxActorModelLookup,
  roles,
  systemRoles,
  worldRoles,
} from "@mp/game/server";
import { SyncEntity } from "@mp/sync";
import { opt } from "../options";
import { InjectionContext } from "@mp/ioc";
import type { PublicUrl } from "@mp/std";
import type { SimpleQueryQueryForItem, SearchResult } from "./pagination";
import { rpc } from "./rpc-builder";
import type { AccessToken } from "@mp/auth";

export const systemRouter = rpc.router({
  buildVersion: rpc.procedure.output<string>().query(() => opt.buildVersion),

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
      return SyncEntity.shouldOptimizeCollects;
    }),

  setPatchOptimizerEnabled: rpc.procedure
    .use(roles([systemRoles.changeSettings]))
    .input<boolean>()
    .mutation(({ input }) => {
      // TODO update config in database
      SyncEntity.shouldOptimizeCollects = input;
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
    .query(({ input: areaId, ctx }) => {
      const resolveUrl = ctx.get(ctxAreaFileUrlResolver);
      return resolveUrl(areaId);
    }),
  actorSpritesheetUrls: rpc.procedure.output<ActorSpritesheetUrls>().query(
    ({ ctx }) =>
      new Map(
        ctx
          .get(ctxActorModelLookup)
          .entries()
          .map(([modelId, { spritesheets }]) => [modelId, spritesheets]),
      ),
  ),

  auth: rpc.procedure.input<AccessToken>().mutation(() => {
    // TODO broadcast to services
  }),
});

export const ctxAreaFileUrlResolver = InjectionContext.new<
  (areaId: AreaId) => PublicUrl
>("AreaFileUrlResolver");
