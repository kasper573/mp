import { Vector, type VectorLike } from "@mp/math";
import { assert, type Tile } from "@mp/std";
import type { ObjectId } from "@mp/tiled-loader";
import type { ActorId } from "../actor";
import { ctxGameState } from "../game-state";
import { rpc } from "../rpc";
import { roles } from "../user/auth";
import { ctxGameStateServer } from "../game-state-server";
import { characterRoles } from "../../shared/roles";
import { ctxCharacterService } from "./service";
import { type CharacterId } from "./types";
import { accessCharacter } from "./access";

export type CharacterRouter = typeof characterRouter;
export const characterRouter = rpc.router({
  move: rpc.procedure
    .input<{
      characterId: CharacterId;
      to: VectorLike<Tile>;
      desiredPortalId?: ObjectId;
    }>()
    .use(roles([characterRoles.move]))
    .mutation(({ input: { characterId, to, desiredPortalId }, ctx }) => {
      const char = accessCharacter(ctx, characterId);

      if (!char.health) {
        throw new Error("Cannot move a dead character");
      }

      char.attackTargetId = undefined;
      char.moveTarget = Vector.from(to);
      char.desiredPortalId = desiredPortalId;
    }),

  attack: rpc.procedure
    .input<{ characterId: CharacterId; targetId: ActorId }>()
    .use(roles([characterRoles.attack]))
    .mutation(({ input: { characterId, targetId }, ctx }) => {
      const char = accessCharacter(ctx, characterId);

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
      const server = ctx.get(ctxGameStateServer);
      const target = assert(state.actors.get(targetId));
      target.health = 0;
      server.addEvent("actor.death", target.id);
    }),

  respawn: rpc.procedure
    .input<CharacterId>()
    .use(roles([characterRoles.respawn]))
    .mutation(({ input: characterId, ctx }) => {
      const char = accessCharacter(ctx, characterId);

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
