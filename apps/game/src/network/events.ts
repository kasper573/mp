import { evt } from "./event-builder";
import { ctxGameStateServer } from "../game-state/game-state-server";
import { ctxUserSession } from "../user/session";
import { assert } from "@mp/std";
import type { AreaId } from "../area/area-id";
import type { CharacterId } from "../character/types";
import { ctxArea } from "../context/common";
import { ctxGameState } from "../game-state/game-state";
import { ctxGameStateLoader } from "../game-state/game-state-loader";
import { roles } from "../user/auth";
import { gatewayRoles } from "../user/roles";

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
        const db = ctx.get(ctxGameStateLoader);
        void db
          .assignAreaIdToCharacterInDb(input.characterId, currentArea.id)
          .then((character) => {
            character.movement.coords = currentArea.start;
            state.actors.set(input.characterId, character);
            server.markToResendFullState(input.characterId);
          });
      }
    }),
});

export const networkEventRouterSlice = { network: networkEventRouter };
