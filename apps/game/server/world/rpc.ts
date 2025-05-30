import type { AuthToken } from "@mp/auth";
import { ctxGameState } from "../game-state";
import { rpc } from "../rpc";
import { ctxTokenVerifier } from "../user/auth";
import { ctxClientRegistry } from "../user/client-registry";
import { ctxClientId } from "../user/client-id";
import type { CharacterId } from "../character/types";
import { ctxCharacterService } from "../character/service";
import { ctxGameStateEmitter } from "../game-state-emitter";
import { ActorFactory } from "../traits/actor";

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
      const existingCharacter = state.actors
        .values()
        .filter((actor) => actor.type === "character")
        .find((actor) => actor.userId === user.id);

      if (existingCharacter) {
        return existingCharacter.id;
      }

      const char = await characterService.getOrCreateCharacterForUser(user);
      state.actors.set(
        char.id,
        ActorFactory.create({ type: "character", ...char }),
      );
      return char.id;
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
