import type { AreaId, CharacterId } from "@mp/db/types";
import { gatewayRoles } from "@mp/keycloak";
import {
  ctxArea,
  ctxGameState,
  ctxGameStateLoader,
  ctxGameStateServer,
  ctxLogger,
} from "../context";
import { evt, roles } from "../integrations/event-router";

/**
 * Emitted by a game service when a character wants to join another game service.
 */
export const changeGameService = evt.event
  .use(roles([gatewayRoles.gameServiceBroadcast]))
  .input<{ characterId: CharacterId; areaId: AreaId }>()
  .handler(({ ctx, input }) => {
    const currentArea = ctx.get(ctxArea);
    if (input.areaId === currentArea.id) {
      const state = ctx.get(ctxGameState);
      const server = ctx.get(ctxGameStateServer);
      const logger = ctx.get(ctxLogger);
      const db = ctx.get(ctxGameStateLoader);

      // Void instead of await because we don't want to suspend the event routers queue handler.
      void db
        .assignAreaIdToCharacterInDb(input.characterId, currentArea.id)
        .then((character) => {
          logger.debug(
            { characterId: input.characterId },
            "Character joined game service via gateway broadcast",
          );
          character.movement.coords = currentArea.start;
          state.actors.set(input.characterId, character);
          server.markToResendFullState(input.characterId);
        })
        .catch((error) =>
          logger.error(
            new Error("Failed to assign area id to character in db", {
              cause: error,
            }),
          ),
        );
    }
  });
