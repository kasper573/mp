import { Vector, type VectorLike } from "@mp/math";
import { recordValues, type Tile } from "@mp/std";
import { defineRoles, roles } from "@mp-modules/user";
import { schemaFor, t, TRPCError } from "@mp-modules/trpc/server";
import type { ActorId } from "../traits/actor";
import { ctxGameStateMachine } from "../game-state";
import { type CharacterId } from "./schema";
import { ctxCharacterService } from "./service";

export const characterRoles = defineRoles("character", [
  "join",
  "move",
  "attack",
  "kill",
  "respawn",
]);

export type CharacterRouter = typeof characterRouter;
export const characterRouter = t.router({
  move: t.procedure
    .input(schemaFor<{ characterId: CharacterId; to: VectorLike<Tile> }>())
    .use(roles([characterRoles.move]))
    .mutation(({ input: { characterId, to }, ctx: { user, ioc } }) => {
      const state = ioc.get(ctxGameStateMachine);
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

      if (!char.health) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Cannot move a dead character",
        });
      }

      state.actors.update(char.id, {
        attackTargetId: undefined,
        moveTarget: Vector.from(to),
      });
    }),

  attack: t.procedure
    .input(schemaFor<{ characterId: CharacterId; targetId: ActorId }>())
    .use(roles([characterRoles.attack]))
    .mutation(({ input: { characterId, targetId }, ctx: { user, ioc } }) => {
      const state = ioc.get(ctxGameStateMachine);
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
    .use(roles([characterRoles.join]))
    .mutation(async ({ ctx: { user, ioc } }) => {
      const state = ioc.get(ctxGameStateMachine);
      const characterService = ioc.get(ctxCharacterService);
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

  kill: t.procedure
    .input(schemaFor<{ targetId: ActorId }>())
    .use(roles([characterRoles.kill])) // TODO new role
    .mutation(({ input: { targetId }, ctx: { ioc } }) => {
      const state = ioc.get(ctxGameStateMachine);
      const target = state.actors()[targetId];
      state.actors.update(target.id, { health: 0 });
    }),

  respawn: t.procedure
    .input(schemaFor<CharacterId>())
    .use(roles([characterRoles.respawn])) // TODO new role
    .mutation(({ input: characterId, ctx: { user, ioc } }) => {
      const state = ioc.get(ctxGameStateMachine);
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

      if (char.health > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Character is not dead",
        });
      }

      const characterService = ioc.get(ctxCharacterService);
      state.actors.update(char.id, {
        health: char.maxHealth,
        ...characterService.getDefaultSpawnPoint(),
      });
    }),
});

export const characterRouterSlice = { character: characterRouter };
