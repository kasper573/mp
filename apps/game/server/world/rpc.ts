import { recordValues } from "@mp/std";
import type { AuthToken } from "@mp/auth";
import { ctxGameState } from "../game-state";
import { rpc } from "../rpc";
import { ctxTokenResolver, roles } from "../user/auth";
import { ctxClientRegistry } from "../user/client-registry";
import { ctxClientId } from "../user/client-id";
import type { Character } from "../character/types";
import { type CharacterId } from "../character/types";
import { ctxCharacterService } from "../character/service";
import { ctxGameStateEmitter } from "../game-state-emitter";
import { worldRoles } from "../../shared/roles";
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
      const characters = recordValues(state.actors).filter(
        (actor) => actor.type === "character",
      );
      return characterPaginator(characters.toArray(), input, 50);
    }),

  auth: rpc.procedure.input<AuthToken>().mutation(async ({ input, ctx }) => {
    const clientId = ctx.get(ctxClientId);
    const clients = ctx.get(ctxClientRegistry);
    const tokenResolver = ctx.get(ctxTokenResolver);
    const result = await tokenResolver(input);
    if (result.isErr()) {
      throw new Error("Failed to authenticate", { cause: result.error });
    }
    clients.set(clientId, { userId: result.value.id, authToken: input });
  }),

  spectate: rpc.procedure
    .use(roles([worldRoles.spectate]))
    .input<CharacterId>()
    .mutation(() => {}),

  join: rpc.procedure
    .use(roles([worldRoles.join]))
    .output<Pick<Character, "id" | "areaId">>()
    .mutation(async ({ ctx, mwc }) => {
      const clientId = ctx.get(ctxClientId);
      const state = ctx.get(ctxGameState);
      const stateEmitter = ctx.get(ctxGameStateEmitter);
      stateEmitter.markToResendFullState(clientId);

      const characterService = ctx.get(ctxCharacterService);
      const existingCharacter = recordValues(state.actors)
        .filter((actor) => actor.type === "character")
        .find((actor) => actor.userId === mwc.user.id);

      if (existingCharacter) {
        return existingCharacter;
      }

      const char = await characterService.getOrCreateCharacterForUser(mwc.user);
      state.actors[char.id] = char;
      const { id, areaId } = char;
      return { id, areaId };
    }),

  requestFullState: rpc.procedure.query(({ ctx }) => {
    const clientId = ctx.get(ctxClientId);
    const stateEmitter = ctx.get(ctxGameStateEmitter);
    stateEmitter.markToResendFullState(clientId);
  }),

  leave: rpc.procedure.input<CharacterId>().mutation(({ ctx }) => {
    const clientId = ctx.get(ctxClientId);
    const clients = ctx.get(ctxClientRegistry);
    clients.remove(clientId);
  }),
});

export const worldRouterSlice = { world: worldRouter };
