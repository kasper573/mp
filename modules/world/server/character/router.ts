import { type Vector } from "@mp/math";
import { recordValues, type Tile } from "@mp/std";
import { auth, roles } from "@mp-modules/user";
import { schemaFor, t, TRPCError } from "@mp-modules/trpc/server";
import type { ActorId } from "../traits/actor";
import { ctx_worldStateMachine } from "../world/WorldState";
import { type CharacterId } from "./schema";
import { ctx_characterService } from "./service";

export type CharacterRouter = typeof characterRouter;
export const characterRouter = t.router({
  move: t.procedure
    .input(schemaFor<{ characterId: CharacterId; to: Vector<Tile> }>())
    .use(roles(["move_character"]))
    .mutation(({ input: { characterId, to }, ctx: { user, ioc } }) => {
      const state = ioc.get(ctx_worldStateMachine);
      const char = state.actors()[characterId];

      if (!char || char.type !== "character") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Character not found",
        });
      }

      if (char.userId !== user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You don't have access to this character",
        });
      }

      state.actors.update(char.id, {
        attackTargetId: undefined,
        moveTarget: to,
      });
    }),

  attack: t.procedure
    .input(schemaFor<{ characterId: CharacterId; targetId: ActorId }>())
    .use(roles(["character_attack"]))
    .mutation(({ input: { characterId, targetId }, ctx: { user, ioc } }) => {
      const state = ioc.get(ctx_worldStateMachine);
      const char = state.actors()[characterId];

      if (!char || char.type !== "character") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Character not found",
        });
      }

      if (char.userId !== user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You don't have access to this character",
        });
      }

      if (targetId === characterId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "You can't attack yourself",
        });
      }

      state.actors.update(characterId, {
        attackTargetId: targetId,
      });
    }),

  join: t.procedure
    .output(schemaFor<CharacterId>())
    .use(auth())
    .mutation(async ({ ctx: { user, ioc } }) => {
      const state = ioc.get(ctx_worldStateMachine);
      const characterService = ioc.get(ctx_characterService);
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
});

export const characterRouterSlice = { character: characterRouter };
