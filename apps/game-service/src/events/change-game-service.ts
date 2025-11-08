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
            character.movement.coords = currentArea.start;
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
