import { Vector, type VectorLike } from "@mp/math";
import { assert, type Tile } from "@mp/std";
import type { ObjectId } from "@mp/tiled-loader";
import { roles } from "../user/auth";
import { characterRoles } from "../user/roles";
import { ctxCharacterService } from "./service";
import type { CharacterId } from "./types";
import { accessCharacter } from "./access";
import type { ActorId } from "../actor/actor";
import { ctxGameState } from "../game-state/game-state";
import { ctxGameStateServer } from "../game-state/game-state-server";
import { eventHandlerBuilder } from "../network/event-definition";

export type CharacterRouter = typeof characterRouter;
export const characterRouter = eventHandlerBuilder.router({
  move: eventHandlerBuilder.event
    .input<{
      characterId: CharacterId;
      to: VectorLike<Tile>;
      desiredPortalId?: ObjectId;
    }>()
    .use(roles([characterRoles.move]))
    .handler(({ input: { characterId, to, desiredPortalId }, ctx }) => {
      const char = accessCharacter(ctx, characterId);

      if (!char.health) {
        throw new Error("Cannot move a dead character");
      }

      char.attackTargetId = undefined;
      char.moveTarget = Vector.from(to);
      char.desiredPortalId = desiredPortalId;
    }),

  attack: eventHandlerBuilder.event
    .input<{ characterId: CharacterId; targetId: ActorId }>()
    .use(roles([characterRoles.attack]))
    .handler(({ input: { characterId, targetId }, ctx }) => {
      const char = accessCharacter(ctx, characterId);

      if (targetId === characterId) {
        throw new Error("You can't attack yourself");
      }

      char.attackTargetId = targetId;
    }),

  kill: eventHandlerBuilder.event
    .input<{ targetId: ActorId }>()
    .use(roles([characterRoles.kill]))
    .handler(({ input: { targetId }, ctx }) => {
      const state = ctx.get(ctxGameState);
      const server = ctx.get(ctxGameStateServer);
      const target = assert(state.actors.get(targetId));
      target.health = 0;
      server.addEvent("actor.death", target.id);
    }),

  respawn: eventHandlerBuilder.event
    .input<CharacterId>()
    .use(roles([characterRoles.respawn]))
    .handler(({ input: characterId, ctx }) => {
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

export const characterEventRouterSlice = { character: characterRouter };
