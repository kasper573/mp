import { Vector, type VectorLike } from "@mp/math";
import { type Tile } from "@mp/std";
import type { ObjectId } from "@mp/tiled-loader";
import type { Actor, ActorId } from "../actor";
import { ctxGameState } from "../game-state";
import { rpc } from "../rpc";
import { roles } from "../user/auth";
import { defineRoles } from "../user/define-roles";
import { ctxGameStateEmitter } from "../game-state-emitter";
import { ctxCharacterService } from "./service";
import { type CharacterId } from "./types";

export const characterRoles = defineRoles("character", [
  "move",
  "attack",
  "kill",
  "respawn",
]);

export type CharacterRouter = typeof characterRouter;
export const characterRouter = rpc.router({
  move: rpc.procedure
    .input<{
      characterId: CharacterId;
      to: VectorLike<Tile>;
      desiredPortalId?: ObjectId;
    }>()
    .use(roles([characterRoles.move]))
    .mutation(
      ({ input: { characterId, to, desiredPortalId }, ctx, mwc: { user } }) => {
        const state = ctx.get(ctxGameState);
        const char = state.actors[characterId] as Actor | undefined;

        if (!char || char.type !== "character") {
          throw new Error("Character not found");
        }

        if (char.userId !== user.id) {
          throw new Error("You don't have access to this character");
        }

        if (!char.health) {
          throw new Error("Cannot move a dead character");
        }

        char.attackTargetId = undefined;
        char.moveTarget = Vector.from(to);
        char.desiredPortalId = desiredPortalId;
      },
    ),

  attack: rpc.procedure
    .input<{ characterId: CharacterId; targetId: ActorId }>()
    .use(roles([characterRoles.attack]))
    .mutation(({ input: { characterId, targetId }, ctx, mwc: { user } }) => {
      const state = ctx.get(ctxGameState);
      const char = state.actors[characterId] as Actor | undefined;

      if (!char || char.type !== "character") {
        throw new Error("Character not found");
      }

      if (char.userId !== user.id) {
        throw new Error("You don't have access to this character");
      }

      if (targetId === characterId) {
        throw new Error("You can't attack yourself");
      }

      char.attackTargetId = targetId;
    }),

  kill: rpc.procedure
    .input<{ targetId: ActorId }>()
    .use(roles([characterRoles.kill]))
    .mutation(({ input: { targetId }, ctx }) => {
      const state = ctx.get(ctxGameState);
      const emitter = ctx.get(ctxGameStateEmitter);
      const target = state.actors[targetId];
      target.health = 0;
      emitter.addEvent("actor.death", target.id);
    }),

  respawn: rpc.procedure
    .input<CharacterId>()
    .use(roles([characterRoles.respawn]))
    .mutation(({ input: characterId, ctx, mwc: { user } }) => {
      const state = ctx.get(ctxGameState);
      const char = state.actors[characterId] as Actor | undefined;

      if (!char || char.type !== "character") {
        throw new Error("Character not found");
      }

      if (char.userId !== user.id) {
        throw new Error("You don't have access to this character");
      }

      if (char.health > 0) {
        throw new Error("Character is not dead");
      }

      const characterService = ctx.get(ctxCharacterService);
      const spawnPoint = characterService.getDefaultSpawnPoint();
      char.health = char.maxHealth;
      char.coords = spawnPoint.coords;
      char.areaId = spawnPoint.areaId;
    }),
});

export const characterRouterSlice = { character: characterRouter };
