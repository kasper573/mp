import { recordValues } from "@mp/std";
import type { AuthToken } from "@mp/auth";
import { ctxGameStateMachine } from "../game-state";
import { rpc } from "../rpc";
import { ctxTokenVerifier } from "../user/auth";
import { ctxClientRegistry } from "../user/client-registry";
import { ctxClientId } from "../user/client-id";
import type { CharacterId } from "../character/schema";
import { ctxCharacterService } from "../character/service";

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

      const state = ctx.get(ctxGameStateMachine);
      state.$flush.markToResendFullState(clientId);

      const characterService = ctx.get(ctxCharacterService);
      const existingCharacter = recordValues(state.actors())
        .filter((actor) => actor.type === "character")
        .find((actor) => actor.userId === user.id);

      if (existingCharacter) {
        return existingCharacter.id;
      }

      const char = await characterService.getOrCreateCharacterForUser(user);
      state.actors.set(char.id, { type: "character", ...char });
      return char.id;
    }),

  leave: rpc.procedure
    .input<CharacterId>()
    .mutation(({ input: characterId, ctx }) => {
      const clientId = ctx.get(ctxClientId);
      const clients = ctx.get(ctxClientRegistry);
      clients.remove(clientId);
    }),
});

export const worldRouterSlice = { world: worldRouter };
