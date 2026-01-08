import { AreaIdType, CharacterIdType } from "@mp/game-shared";
import { gatewayRoles } from "@mp/keycloak";
import { ctxArea, ctxDbSyncSession, ctxLogger } from "../context";
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
    if (input.areaId !== ctx.get(ctxArea).id) {
      return;
    }

    ctx
      .get(ctxLogger)
      .debug(
        { characterId: input.characterId },
        "Character joined game service via gateway broadcast. Will eagerly reload character state from db.",
      );

    ctx.get(ctxDbSyncSession).load(input.characterId);
  });
