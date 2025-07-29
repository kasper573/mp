import { assert } from "@mp/std";
import type { AreaId } from "../area/area-id";
import type { CharacterId } from "../character/types";
import { ctxArea, ctxLogger } from "../context/common";
import { ctxGameState } from "../game-state/game-state";
import { ctxGameStateLoader } from "../game-state/game-state-loader";
import { ctxGameStateServer } from "../game-state/game-state-server";
import { roles } from "../user/auth";
import { gatewayRoles } from "../user/roles";
import { ctxUserSession } from "../user/session";
import { evt } from "./event-builder";

export type NetworkRouter = typeof networkEventRouter;
export const networkEventRouter = evt.router({
  requestFullState: evt.event.handler(({ ctx }) => {
    const session = ctx.get(ctxUserSession);
    const server = ctx.get(ctxGameStateServer);
    server.markToResendFullState(
      assert(
        session.characterId,
        "Cannot resend full game state, user session has no character id",
      ),
    );
  }),

  characterWantsToJoinArea: evt.event
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
    }),
});

export const networkEventRouterSlice = { network: networkEventRouter };
