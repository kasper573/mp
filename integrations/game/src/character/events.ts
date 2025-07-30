import type { CharacterId } from "@mp/db/types";
import type { ActorId } from "@mp/game-shared";
import { ctxGameState } from "@mp/game-shared";
import { characterRoles } from "@mp/keycloak";
import { Vector, type VectorLike } from "@mp/math";
import { assert, type Tile } from "@mp/std";
import type { ObjectId } from "@mp/tiled-loader";
import { ctxGameStateLoader } from "../game-state/game-state-loader";
import { ctxGameStateServer } from "../game-state/game-state-server";
import { evt } from "../network/event-builder";
import { sendCharacterToArea } from "../traits/movement";
import { roles } from "../user/auth";
import { accessCharacter } from "./access";

export type CharacterRouter = typeof characterRouter;
export const characterRouter = evt.router({
  move: evt.event
    .input<{
      characterId: CharacterId;
      to: VectorLike<Tile>;
      desiredPortalId?: ObjectId;
    }>()
    .use(roles([characterRoles.move]))
    .handler(({ input: { characterId, to, desiredPortalId }, ctx }) => {
      const char = accessCharacter(ctx, characterId);

      if (!char.combat.health) {
        throw new Error("Cannot move a dead character");
      }

      char.combat.attackTargetId = undefined;
      char.movement.moveTarget = Vector.from(to);
      char.movement.desiredPortalId = desiredPortalId;
    }),

  attack: evt.event
    .input<{ characterId: CharacterId; targetId: ActorId }>()
    .use(roles([characterRoles.attack]))
    .handler(({ input: { characterId, targetId }, ctx }) => {
      const char = accessCharacter(ctx, characterId);

      if (targetId === characterId) {
        throw new Error("You can't attack yourself");
      }

      char.combat.attackTargetId = targetId;
    }),

  kill: evt.event
    .input<{ targetId: ActorId }>()
    .use(roles([characterRoles.kill]))
    .handler(({ input: { targetId }, ctx }) => {
      const state = ctx.get(ctxGameState);
      const server = ctx.get(ctxGameStateServer);
      const target = assert(state.actors.get(targetId));
      target.combat.health = 0;
      server.addEvent("actor.death", target.identity.id);
    }),

  respawn: evt.event
    .input<CharacterId>()
    .use(roles([characterRoles.respawn]))
    .handler(({ input: characterId, ctx }) => {
      const char = accessCharacter(ctx, characterId);

      if (char.combat.health > 0) {
        throw new Error("Character is not dead");
      }

      const loader = ctx.get(ctxGameStateLoader);
      const spawnPoint = loader.getDefaultSpawnPoint();
      char.combat.health = char.combat.maxHealth;

      sendCharacterToArea(
        ctx,
        char.identity.id,
        spawnPoint.areaId,
        spawnPoint.coords,
      );
    }),
});

export const characterEventRouterSlice = { character: characterRouter };
