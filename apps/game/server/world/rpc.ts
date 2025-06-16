import type { AuthToken, UserId } from "@mp/auth";
import { recordValues } from "@mp/std";
import { ctxGameState } from "../game-state";
import { rpc } from "../rpc";
import { ctxTokenVerifier } from "../user/auth";
import { roles } from "../user/auth";
import { spectatorRoles } from "../spectator";
import { ctxClientRegistry } from "../user/client-registry";
import { ctxClientId } from "../user/client-id";
import { type CharacterId, type Character } from "../character/types";
import { ctxCharacterService } from "../character/service";
import { ctxGameStateEmitter } from "../game-state-emitter";

export type WorldRouter = typeof worldRouter;
export const worldRouter = rpc.router({
  join: rpc.procedure
    .input<AuthToken>()
    .output<CharacterId>()
    .mutation(async ({ input: token, ctx }) => {
      const clientId = ctx.get(ctxClientId);
      const clients = ctx.get(ctxClientRegistry);
      const tokenVerifier = ctx.get(ctxTokenVerifier);
      const result = await tokenVerifier(token);
      if (result.isErr()) {
        throw new Error("Invalid token", { cause: result.error });
      }

      const user = result.value;
      clients.add(clientId, user);

      const state = ctx.get(ctxGameState);
      const stateEmitter = ctx.get(ctxGameStateEmitter);
      stateEmitter.markToResendFullState(clientId);

      const characterService = ctx.get(ctxCharacterService);
      const existingCharacter = recordValues(state.actors)
        .filter((actor): actor is Character => actor.type === "character")
        .find((actor) => actor.userId === user.id);

      if (existingCharacter) {
        return existingCharacter.id;
      }

      const char = await characterService.getOrCreateCharacterForUser(user);
      state.actors[char.id] = char;
      return char.id;
    }),

  spectatorJoin: rpc.procedure
    .input<{ token: AuthToken; spectateUserId: UserId }>()
    .output<CharacterId>()
    .use(roles([spectatorRoles.view]))
    .mutation(async ({ input: { token, spectateUserId }, ctx }) => {
      const clientId = ctx.get(ctxClientId);
      const clients = ctx.get(ctxClientRegistry);
      const tokenVerifier = ctx.get(ctxTokenVerifier);
      const result = await tokenVerifier(token);
      if (result.isErr()) {
        throw new Error("Invalid token", { cause: result.error });
      }

      const user = result.value;
      clients.add(clientId, user);

      const state = ctx.get(ctxGameState);
      const stateEmitter = ctx.get(ctxGameStateEmitter);
      stateEmitter.markToResendFullState(clientId);

      // Find the character we want to spectate
      const targetCharacter = recordValues(state.actors)
        .filter((actor): actor is Character => actor.type === "character")
        .find((actor) => actor.userId === spectateUserId);

      if (!targetCharacter) {
        throw new Error("Player to spectate not found");
      }

      // Return the character ID we're spectating
      return targetCharacter.id;
    }),

  listActivePlayers: rpc.procedure
    .output<
      Array<{ userId: UserId; username: string; characterId: CharacterId }>
    >()
    .use(roles([spectatorRoles.view]))
    .query(({ ctx }) => {
      const state = ctx.get(ctxGameState);
      const clients = ctx.get(ctxClientRegistry);

      // Get all connected users
      const connectedUsers = new Map<UserId, string>();
      for (const clientId of clients.getClientIds()) {
        const user = clients.getUser(clientId);
        if (user && user.name) {
          connectedUsers.set(user.id, user.name);
        }
      }

      // Get all active characters (players) - filter out NPCs
      const activeCharacters = recordValues(state.actors)
        .filter(
          (actor): actor is Character =>
            actor.type === "character" && actor.health > 0,
        )
        .map((character) => ({
          userId: character.userId,
          username: connectedUsers.get(character.userId) || "Unknown",
          characterId: character.id,
        }))
        .toArray();

      return activeCharacters;
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
