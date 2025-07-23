import type { ActorSpritesheetUrls, AreaId, Character } from "@mp/game/server";
import {
  ctxActorModelLookup,
  ctxClientId,
  ctxClientRegistry,
  ctxGameState,
  ctxTokenResolver,
  roles,
  systemRoles,
  worldRoles,
} from "@mp/game/server";
import { shouldOptimizeCollects } from "@mp/sync";
import { opt } from "../options";
import { InjectionContext } from "@mp/ioc";
import type { PublicUrl } from "@mp/std";
import {
  type SimpleQueryQueryForItem,
  type SearchResult,
  createPaginator,
  createSimpleFilter,
  createSimpleSortFactory,
} from "./pagination";
import { rpc } from "./rpc-builder";
import type { AccessToken } from "@mp/auth";

const characterPaginator = createPaginator(
  createSimpleFilter<Character>(),
  createSimpleSortFactory(),
);

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
      return shouldOptimizeCollects.value;
    }),

  setPatchOptimizerEnabled: rpc.procedure
    .use(roles([systemRoles.changeSettings]))
    .input<boolean>()
    .mutation(({ input }) => {
      // TODO update config in database
      shouldOptimizeCollects.value = input;
    }),

  characterList: rpc.procedure
    .use(roles([worldRoles.spectate]))
    .input<SimpleQueryQueryForItem<Character> | undefined>()
    .output<SearchResult<Character>>()
    .query(({ ctx, input = { filter: {} } }) => {
      // TODO query the database for online characters
      const state = ctx.get(ctxGameState);
      const characters = state.actors
        .values()
        .filter((actor) => actor.type === "character");
      return characterPaginator(characters.toArray(), input, 50);
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

  auth: rpc.procedure.input<AccessToken>().mutation(async ({ input, ctx }) => {
    const clientId = ctx.get(ctxClientId);
    const clients = ctx.get(ctxClientRegistry);
    const tokenResolver = ctx.get(ctxTokenResolver);
    const result = await tokenResolver(input);
    if (result.isErr()) {
      throw new Error("Invalid token", { cause: result.error });
    }
    clients.userIds.set(clientId, result.value.id);
  }),
});

export const ctxAreaFileUrlResolver = InjectionContext.new<
  (areaId: AreaId) => PublicUrl
>("AreaFileUrlResolver");
