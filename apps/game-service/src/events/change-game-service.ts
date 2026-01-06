import { AreaIdType, CharacterIdType } from "@mp/game-shared";
import { gatewayRoles } from "@mp/keycloak";
import {
  ctxActorModelLookup,
  ctxArea,
  ctxDb,
  ctxGameState,
  ctxGameStateServer,
  ctxLogger,
} from "../context";
import { roles } from "../integrations/auth";
import { evt } from "../integrations/event-router";
import { type } from "@mp/validate";

/**
 * Emitted by a game service when a character wants to join another game service.
 */
export const changeGameService = evt.event
  .use(roles([gatewayRoles.gameServiceBroadcast]))
  .input(
    type({
      characterId: CharacterIdType,
      areaId: AreaIdType,
    }),
  )
  .handler(({ ctx, input }) => {
    const currentArea = ctx.get(ctxArea);
    if (input.areaId === currentArea.id) {
      const state = ctx.get(ctxGameState);
      const server = ctx.get(ctxGameStateServer);
      const logger = ctx.get(ctxLogger);
      const db = ctx.get(ctxDb);
      const actorModels = ctx.get(ctxActorModelLookup);

      // Void instead of await because we don't want to suspend the event routers queue handler.
      void db
        .updateCharactersArea({
          actorModels,
          characterId: input.characterId,
          newAreaId: currentArea.id,
        })
        .then((result) => {
          if (result.isOk()) {
            logger.debug(
              { characterId: input.characterId },
              "Character joined game service via gateway broadcast",
            );
            const character = result.value;
            // Only set coords to spawn point if the character is alive.
            // Dead characters should preserve their death position.
            // Note: We check health > 0 rather than combat.alive because alive
            // is always set to true when loading from the database (see transform.ts).
            if (character.combat.health > 0) {
              character.movement.coords = currentArea.start;
            }
            state.actors.set(input.characterId, character);
            server.markToResendFullState(input.characterId);
          } else {
            logger.error(
              new Error("Failed to assign area id to character in db", {
                cause: result.error,
              }),
            );
          }
        });
    }
  });
