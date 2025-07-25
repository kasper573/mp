import type { AccessToken } from "@mp/auth";
import { ctxGameState } from "../game-state/game-state";
import { rpc } from "../rpc/rpc-definition";
import { ctxTokenResolver, roles } from "../user/auth";
import { ctxClientRegistry } from "../user/client-registry";
import { ctxClientId } from "../user/client-id";
import type { Character } from "../character/types";
import type { CharacterId } from "../character/types";
import { ctxCharacterService } from "../character/service";
import { ctxGameStateServer } from "../game-state/game-state-server";
import { worldRoles } from "../user/roles";
import type { SimpleQueryQueryForItem } from "../pagination";
import {
  createPaginator,
  createSimpleFilter,
  createSimpleSortFactory,
  type SearchResult,
} from "../pagination";

const characterPaginator = createPaginator(
  createSimpleFilter<Character>(),
  createSimpleSortFactory(),
);

export type WorldRouter = typeof worldRouter;
export const worldRouter = rpc.router({
  characterList: rpc.procedure
    .use(roles([worldRoles.spectate]))
    .input<SimpleQueryQueryForItem<Character> | undefined>()
    .output<SearchResult<Character>>()
    .query(({ ctx, input = { filter: {} } }) => {
      const state = ctx.get(ctxGameState);
      const characters = state.actors
        .values()
        .filter((actor) => actor.type === "character");
      return characterPaginator(characters.toArray(), input, 50);
    }),

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

  removeAuth: rpc.procedure
    .input<AccessToken>()
    .mutation(async ({ input, ctx }) => {
      const clientId = ctx.get(ctxClientId);
      const clients = ctx.get(ctxClientRegistry);
      const tokenResolver = ctx.get(ctxTokenResolver);
      const result = await tokenResolver(input);
      if (result.isErr()) {
        throw new Error("Invalid token", { cause: result.error });
      }
      clients.userIds.delete(clientId);
    }),

  spectate: rpc.procedure
    .use(roles([worldRoles.spectate]))
    .input<CharacterId>()
    .mutation(({ ctx, input }) => {
      const clients = ctx.get(ctxClientRegistry);
      const clientId = ctx.get(ctxClientId);
      clients.spectatedCharacterIds.set(clientId, input);
      const server = ctx.get(ctxGameStateServer);
      server.markToResendFullState(clientId);
    }),

  join: rpc.procedure
    .use(roles([worldRoles.join]))
    .output<Pick<Character, "id" | "areaId">>()
    .mutation(async ({ ctx, mwc }) => {
      const clientId = ctx.get(ctxClientId);
      const state = ctx.get(ctxGameState);
      const server = ctx.get(ctxGameStateServer);
      server.markToResendFullState(clientId);

      const characterService = ctx.get(ctxCharacterService);
      let char = state.actors
        .values()
        .filter((actor) => actor.type === "character")
        .find((actor) => actor.userId === mwc.userId);

      if (!char) {
        char = await characterService.getOrCreateCharacterForUser(mwc.userId);
        state.actors.set(char.id, char);
      }

      const clients = ctx.get(ctxClientRegistry);
      clients.characterIds.set(clientId, char.id);

      const { id, areaId } = char;
      return { id, areaId };
    }),

  requestFullState: rpc.procedure.query(({ ctx }) => {
    const clientId = ctx.get(ctxClientId);
    const server = ctx.get(ctxGameStateServer);
    server.markToResendFullState(clientId);
  }),

  leave: rpc.procedure.input<CharacterId>().mutation(({ ctx }) => {
    const clientId = ctx.get(ctxClientId);
    const clients = ctx.get(ctxClientRegistry);

    // Removing the clients character from the registry will eventually
    // lead to the game behavior removing the actor from the game state.
    // This allows the character to remain in the game state for a moment before removal,
    // preventing "quick disconnect" cheating, or allows for connection losses to be handled gracefully.
    clients.characterIds.delete(clientId);
    clients.spectatedCharacterIds.delete(clientId);
  }),
});

export const worldRouterSlice = { world: worldRouter };
