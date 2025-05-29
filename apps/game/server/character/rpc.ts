import { Vector, type VectorLike } from "@mp/math";
import { type Tile } from "@mp/std";
import type { Actor, ActorId } from "../traits/actor";
import { ctxGameStateMachine } from "../game-state";
import { rpc } from "../rpc";
import { roles } from "../user/auth";
import { defineRoles } from "../user/define-roles";
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
    .input<{ characterId: CharacterId; to: VectorLike<Tile> }>()
    .use(roles([characterRoles.move]))
    .mutation(({ input: { characterId, to }, ctx, mwc: { user } }) => {
      const state = ctx.get(ctxGameStateMachine);
      const char = state.actors()[characterId] as Actor | undefined;

      if (!char || char.type !== "character") {
        throw new Error("Character not found");
      }

      if (char.userId !== user.id) {
        throw new Error("You don't have access to this character");
      }

      if (!char.health) {
        throw new Error("Cannot move a dead character");
      }

      state.actors.update(char.id, (update) =>
        update
          .add("attackTargetId", undefined)
          .add("moveTarget", Vector.from(to)),
      );
    }),

  attack: rpc.procedure
    .input<{ characterId: CharacterId; targetId: ActorId }>()
    .use(roles([characterRoles.attack]))
    .mutation(({ input: { characterId, targetId }, ctx, mwc: { user } }) => {
      const state = ctx.get(ctxGameStateMachine);
      const char = state.actors()[characterId] as Actor | undefined;

      if (!char || char.type !== "character") {
        throw new Error("Character not found");
      }

      if (char.userId !== user.id) {
        throw new Error("You don't have access to this character");
      }

      if (targetId === characterId) {
        throw new Error("You can't attack yourself");
      }

      state.actors.update(characterId, (u) =>
        u.add("attackTargetId", targetId),
      );
    }),

  kill: rpc.procedure
    .input<{ targetId: ActorId }>()
    .use(roles([characterRoles.kill]))
    .mutation(({ input: { targetId }, ctx }) => {
      const state = ctx.get(ctxGameStateMachine);
      const target = state.actors()[targetId];
      state.actors.update(target.id, (u) => u.add("health", 0));
    }),

  respawn: rpc.procedure
    .input<CharacterId>()
    .use(roles([characterRoles.respawn]))
    .mutation(({ input: characterId, ctx, mwc: { user } }) => {
      const state = ctx.get(ctxGameStateMachine);
      const char = state.actors()[characterId] as Actor | undefined;

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
      state.actors.update(char.id, (update) =>
        update
          .add("health", char.maxHealth)
          .add("coords", spawnPoint.coords)
          .add("areaId", spawnPoint.areaId),
      );
    }),
});

export const characterRouterSlice = { character: characterRouter };
